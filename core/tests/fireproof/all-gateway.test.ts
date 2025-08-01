import { Database, Ledger, LedgerFactory, PARAM, fireproof } from "@fireproof/core";

import { fileContent } from "./cars/bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i.js";
import { simpleCID } from "../helpers.js";
import { BuildURI, Future } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import {
  CarStore,
  MetaStore,
  FileStore,
  WALStore,
  SerdeGateway,
  Loadable,
  FPEnvelopeTypes,
  WALState,
  SerdeGatewayCtx,
  FPEnvelopeMeta,
  UnsubscribeResult,
  DbMetaEvent,
} from "@fireproof/core-types-blockstore";
import { describe, afterEach, beforeEach, it, expect } from "vitest";

describe("noop Gateway", function () {
  let db: Ledger;
  let carStore: CarStore;
  let metaStore: MetaStore;
  let fileStore: FileStore;
  let walStore: WALStore;
  let carGateway: SerdeGateway;
  let metaGateway: SerdeGateway;
  let fileGateway: SerdeGateway;
  let walGateway: SerdeGateway;
  const sthis = ensureSuperThis();
  let ctx: { loader: Loadable };

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    db = LedgerFactory("test-gateway-" + sthis.nextId().str, {
      logger: sthis.logger,
    });
    await db.ready();
    ctx = { loader: db.crdt.blockstore.loader };

    // Extract stores from the loader
    carStore = ctx.loader.attachedStores.local().active.car;
    metaStore = ctx.loader.attachedStores.local().active.meta;
    fileStore = ctx.loader.attachedStores.local().active.file;
    walStore = ctx.loader.attachedStores.local().active.wal;

    // Extract and log gateways
    carGateway = carStore.realGateway;
    metaGateway = metaStore.realGateway;
    fileGateway = fileStore.realGateway;
    walGateway = walStore.realGateway;
  });

  it("should have valid stores and gateways", async () => {
    // Add assertions
    expect(carStore).toBeTruthy();
    expect(metaStore).toBeTruthy();
    expect(fileStore).toBeTruthy();
    expect(walStore).toBeTruthy();

    expect(carGateway).toBeTruthy();
    expect(metaGateway).toBeTruthy();
    expect(fileGateway).toBeTruthy();
    expect(walGateway).toBeTruthy();
  });

  it("should have correct store names", async () => {
    // Check that all stores have the correct name
    expect(carStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(metaStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(fileStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(walStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
  });

  it("should have correct store types in URLs", async () => {
    // Check that all stores have the correct store type in their URL
    expect(carStore.url().toString()).toContain("store=car");
    expect(carStore.url().toString()).toContain("suffix=.car");
    expect(metaStore.url().toString()).toContain("store=meta");
    expect(fileStore.url().toString()).toContain("store=file");
    expect(walStore.url().toString()).toContain("store=wal");
  });

  it("should have version specified in URLs", async () => {
    // Verify that all stores have a version specified
    expect(carStore.url().toString()).toContain("version=");
    expect(metaStore.url().toString()).toContain("version=");
    expect(fileStore.url().toString()).toContain("version=");
    expect(walStore.url().toString()).toContain("version=");
  });

  it("should have correct gateway types", async () => {
    // Check that all gateways are instances of the expected gateway class
    expect(typeof carGateway).toBe("object");
    expect(typeof metaGateway).toBe("object");
    expect(typeof fileGateway).toBe("object");
    expect(typeof walGateway).toBe("object");
  });

  it("should build CAR Gateway URL", async () => {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const carUrl = await carGateway.buildUrl(ctx, carStore.url(), testKey);
    expect(carUrl.Ok().hasParam("key")).toBeTruthy();
  });

  it("should start CAR Gateway", async () => {
    const url = await carGateway.start(ctx, carStore.url());
    expect(url.Ok().asObj()).toEqual(carStore.url().asObj());
  });

  it("should put data in CAR Gateway", async () => {
    const carUrl = await carGateway.buildUrl(ctx, carStore.url(), fileContent.cid);
    await carGateway.start(ctx, carStore.url());
    const carPutResult = await carGateway.put(ctx, carUrl.Ok(), {
      type: FPEnvelopeTypes.CAR,
      payload: fileContent.block,
    });
    expect(carPutResult.isOk()).toBeTruthy();
  });

  it("should get data from CAR Gateway", async () => {
    const carUrl = await carGateway.buildUrl(ctx, carStore.url(), fileContent.cid);
    await carGateway.start(ctx, carStore.url());
    await carGateway.put(ctx, carUrl.Ok(), {
      type: FPEnvelopeTypes.CAR,
      payload: fileContent.block,
    });
    const carGetResult = await carGateway.get(ctx, carUrl.Ok());
    expect(carGetResult.Ok().type).toEqual("car");
    expect(carGetResult.Ok().payload).toEqual(fileContent.block);
    // customExpect(carGetResult.Ok(), (v) => expect(v).toEqual(testData), "carGetResult should match testData");
  });

  it("should delete data from CAR Gateway", async () => {
    const carUrl = await carGateway.buildUrl(ctx, carStore.url(), fileContent.cid);
    await carGateway.start(ctx, carStore.url());
    await carGateway.put(ctx, carUrl.Ok(), {
      type: FPEnvelopeTypes.CAR,
      payload: fileContent.block,
    });
    const carDeleteResult = await carGateway.delete(ctx, carUrl.Ok());
    expect(carDeleteResult.isOk()).toBeTruthy();
  });

  it("should close CAR Gateway", async () => {
    await carGateway.close(ctx, carStore.url());
  });
  it("should build Meta Gateway URL", async () => {
    const metaUrl = await metaGateway.buildUrl(ctx, metaStore.url(), "main");
    expect(metaUrl.Ok()).toBeTruthy();
  });

  it("should start Meta Gateway", async () => {
    await metaGateway.start(ctx, metaStore.url());
  });

  it("should close Meta Gateway", async () => {
    await metaGateway.start(ctx, metaStore.url());
    await metaGateway.close(ctx, metaStore.url());
  });

  it("should build File Gateway URL", async () => {
    const fileUrl = await fileGateway.buildUrl(ctx, fileStore.url(), fileContent.cid);
    expect(fileUrl.Ok()).toBeTruthy();
  });

  it("should start File Gateway", async () => {
    await fileGateway.start(ctx, fileStore.url());
  });

  it("should put data to File Gateway", async () => {
    const fileUrl = await fileGateway.buildUrl(ctx, fileStore.url(), fileContent.cid);
    await fileGateway.start(ctx, fileStore.url());
    const filePutResult = await fileGateway.put(ctx, fileUrl.Ok(), {
      type: FPEnvelopeTypes.FILE,
      payload: fileContent.block,
    });
    expect(filePutResult.Ok()).toBeFalsy();
  });

  it("should get data from File Gateway", async () => {
    const fileUrl = await fileGateway.buildUrl(ctx, fileStore.url(), fileContent.cid);
    await fileGateway.start(ctx, fileStore.url());
    await fileGateway.put(ctx, fileUrl.Ok(), {
      type: FPEnvelopeTypes.FILE,
      payload: fileContent.block,
    });
    const fileGetResult = await fileGateway.get(ctx, fileUrl.Ok());
    expect(fileGetResult.Ok().type).toEqual("file");
    expect(fileGetResult.Ok().payload).toEqual(fileContent.block);
  });

  it("should delete data from File Gateway", async () => {
    const fileUrl = await fileGateway.buildUrl(ctx, fileStore.url(), fileContent.cid);
    await fileGateway.start(ctx, fileStore.url());
    await fileGateway.put(ctx, fileUrl.Ok(), {
      type: FPEnvelopeTypes.FILE,
      payload: fileContent.block,
    });
    const fileDeleteResult = await fileGateway.delete(ctx, fileUrl.Ok());
    expect(fileDeleteResult.isOk()).toBeTruthy();
  });

  it("should close File Gateway", async () => {
    await fileGateway.close(ctx, fileStore.url());
  });
  it("should build WAL Gateway URL", async () => {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(ctx, walStore.url(), testKey);
    expect(walUrl.Ok()).toBeTruthy();
  });

  it("should start WAL Gateway", async () => {
    await walGateway.start(ctx, walStore.url());
  });

  it("should put data to WAL Gateway", async () => {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(ctx, walStore.url(), testKey);
    await walGateway.start(ctx, walStore.url());
    // const walTestDataString = JSON.stringify();
    // const walTestData = sthis.txt.encode(walTestDataString);
    const walPutResult = await walGateway.put(ctx, walUrl.Ok(), {
      type: FPEnvelopeTypes.WAL,
      payload: {
        operations: [],
        noLoaderOps: [],
        fileOperations: [],
      },
    });
    expect(walPutResult.Ok()).toBeFalsy();
  });

  it("should get data from WAL Gateway", async () => {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(ctx, walStore.url(), testKey);
    await walGateway.start(ctx, walStore.url());
    const ref: WALState = {
      operations: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      noLoaderOps: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      fileOperations: [
        {
          cid: await simpleCID(sthis),
          public: false,
        },
      ],
    };
    // const walTestDataString = JSON.stringify({
    //   operations: [],
    //   noLoaderOps: [],
    //   fileOperations: [],
    // });
    // const walTestData = sthis.txt.encode(walTestDataString);
    await walGateway.put(ctx, walUrl.Ok(), {
      type: FPEnvelopeTypes.WAL,
      payload: ref,
    });
    const walGetResult = await walGateway.get(ctx, walUrl.Ok());
    expect(walGetResult.isOk()).toBeTruthy();
    // const okResult = walGetResult.Ok();
    // const decodedResult = sthis.txt.decode(okResult);
    expect(ref).toEqual(walGetResult.Ok().payload);
  });

  it("should delete data from WAL Gateway", async () => {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(ctx, walStore.url(), testKey);
    await walGateway.start(ctx, walStore.url());
    const ref: WALState = {
      operations: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      noLoaderOps: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      fileOperations: [
        {
          cid: await simpleCID(sthis),
          public: false,
        },
      ],
    };
    await walGateway.put(ctx, walUrl.Ok(), {
      type: FPEnvelopeTypes.WAL,
      payload: ref,
    });
    const walDeleteResult = await walGateway.delete(ctx, walUrl.Ok());
    expect(walDeleteResult.isOk()).toBeTruthy();
  });

  it("should close WAL Gateway", async () => {
    await walGateway.start(ctx, walStore.url());
    await walGateway.close(ctx, walStore.url());
  });

  // it("should have correct CAR Gateway properties", async () =>{
  //   // CAR Gateway assertions
  //   expect(carGateway.fidLength).toBe(4);
  //   expect(carGateway.headerSize).toBe(36);
  //   carGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(carStore.).toHaveProperty("url");
  // });

  // it("should have correct Meta Gateway properties", async () =>{
  //   // Meta Gateway assertions
  //   expect(metaGateway.fidLength).toBe(4);
  //   expect(metaGateway.headerSize).toBe(36);
  //   metaGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).not.toHaveProperty("url");
  // });

  // it("should have correct File Gateway properties", async () =>{
  //   // File Gateway assertions
  //   expect(fileGateway.fidLength).toBe(4);
  //   expect(fileGateway.headerSize).toBe(36);
  //   fileGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).toHaveProperty("url");
  // });

  // it("should have correct WAL Gateway properties", async () =>{
  //   // WAL Gateway assertions
  //   expect(walGateway.fidLength).toBe(4);
  //   expect(walGateway.headerSize).toBe(36);
  //   walGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).not.toHaveProperty("url");
  // });
});

describe("noop Gateway subscribe", function () {
  let db: Database;

  let metaStore: MetaStore;

  let metaGateway: SerdeGateway;
  const sthis = ensureSuperThis();
  let ctx: SerdeGatewayCtx;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    db = fireproof("test-gateway-" + sthis.nextId().str);
    await db.close();

    db = fireproof("test-gateway-" + sthis.nextId().str, {
      storeUrls: {
        ...db.ledger.opts.storeUrls,
        data: {
          ...db.ledger.opts.storeUrls.data,
          meta: BuildURI.from(db.ledger.opts.storeUrls.data.meta).setParam(PARAM.SELF_REFLECT, "x").URI(),
        },
      },
    });

    await db.ready();

    ctx = { loader: db.ledger.crdt.blockstore.loader };
    // Extract stores from the loader
    metaStore = db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;

    metaGateway = metaStore.realGateway;
  });
  it("should subscribe to meta Gateway", async () => {
    const metaUrl = await metaGateway.buildUrl(ctx, metaStore.url(), "main");
    await metaGateway.start(ctx, metaStore.url());

    let didCall = false;
    const p = new Future<void>();

    const metaSubscribeResult = (await metaGateway.subscribe(
      ctx,
      metaUrl.Ok().build().setParam(PARAM.SELF_REFLECT, "x").URI(),
      async (data: FPEnvelopeMeta) => {
        // const decodedData = sthis.txt.decode(data);
        expect(Array.isArray(data.payload)).toBeTruthy();
        didCall = true;
        p.resolve();
      },
    )) as UnsubscribeResult;
    expect(metaSubscribeResult.isOk()).toBeTruthy();
    const ok = await db.put({ _id: "key1", hello: "world1" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("key1");
    await p.asPromise();
    expect(didCall).toBeTruthy();
  });
});

describe("Gateway", function () {
  let db: Database;
  // let carStore: ExtendedStore;
  let metaStore: MetaStore;
  // let fileStore: ExtendedStore;
  // let walStore: ExtendedStore;
  // let carGateway: ExtendedGateway;
  let metaGateway: SerdeGateway;
  // let fileGateway: ExtendedGateway;
  // let walGateway: ExtendedGateway;
  const sthis = ensureSuperThis();

  let ctx: SerdeGatewayCtx;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    db = fireproof("test-gateway-" + sthis.nextId().str);
    ctx = { loader: db.ledger.crdt.blockstore.loader };
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");

    // Extract stores from the loader
    // carStore = (await db.blockstore.loader.carStore()) as unknown as ExtendedStore;
    metaStore = db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
    // fileStore = (await db.blockstore.loader.fileStore()) as unknown as ExtendedStore;
    // walStore = (await db.blockstore.loader.WALStore()) as unknown as ExtendedStore;

    // Extract and log gateways
    // carGateway = carStore.gateway;
    metaGateway = metaStore.realGateway;
    // fileGateway = fileStore.gateway;
    // walGateway = walStore.gateway;
  });

  it("should get data from Meta Gateway", async () => {
    const metaUrl = await metaGateway.buildUrl(ctx, metaStore.url(), "main");
    await metaGateway.start(ctx, metaStore.url());
    const metaGetResult = await metaGateway.get(ctx, metaUrl.Ok());
    expect(metaGetResult.isOk()).toBeTruthy();
    const meta = metaGetResult.Ok().payload as DbMetaEvent[];
    // const metaGetResultOk = metaGetResult.Ok();
    // const decodedMetaGetResultOk = sthis.txt.decode(metaGetResultOk);
    expect(meta.length).toBe(1);
    expect(Object.keys(meta[0])).toEqual(["eventCid", "parents", "dbMeta"]);
  });

  it("should delete data from Meta Gateway", async () => {
    const metaUrl = await metaGateway.buildUrl(ctx, metaStore.url(), "main");
    await metaGateway.start(ctx, metaStore.url());
    // should we be testing .destroy() instead?
    const metaDeleteResult = await metaGateway.delete(ctx, metaUrl.Ok());
    expect(metaDeleteResult.isOk()).toBeTruthy();
  });
});
