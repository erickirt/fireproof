import {
  CRDT,
  defaultWriteQueueOpts,
  LedgerOpts,
  toStoreURIRuntime,
  CRDTImpl,
  CRDTMeta,
  DocValue,
  Index,
  index,
} from "@fireproof/core";
import { tracer } from "../helpers.js";
import { AppContext } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { describe, afterEach, beforeEach, it, expect, assert } from "vitest";
import { ensureStoreEnDeFile, Loader, EncryptedBlockstore, parseCarFile } from "@fireproof/core-blockstore";
import { defaultKeyBagOpts } from "@fireproof/core-keybag";
import { AnyBlock, isCarBlockItemReady } from "@fireproof/core-types-blockstore";

describe("Fresh crdt", function () {
  let crdt: CRDT;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    await crdt.ready();
  });
  it("should have an empty head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(0);
  });
  it("should accept put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
  });
  it("should accept multi-put and return results", async () => {
    const didPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    const head = didPut.head;
    expect(head.length).toBe(1);
  });
});

describe("CRDT with one record", function () {
  interface CRDTTestType {
    readonly hello: string;
    readonly nice: string;
  }
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `test@${sthis.nextId().str}`),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
  });
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
  });
  it("should return the head", async () => {
    expect(firstPut.head.length).toBe(1);
  });
  it("return the record on get", async () => {
    const got = (await crdt.get("hello")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.hello).toBe("world");
  });
  it("should accept another put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "nice", value: { nice: "data" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const { doc } = (await crdt.get("nice")) as DocValue<CRDTTestType>;
    expect(doc.nice).toBe("data");
  });
  it("should allow for a delete", async () => {
    const didDel = await crdt.bulk([{ id: "hello", del: true }]);
    expect(didDel.head).toBeTruthy();
    const got = await crdt.get("hello");
    expect(got).toBeFalsy();
  });
  it("should offer changes", async () => {
    const { result } = await crdt.changes<Partial<CRDTTestType>>([]);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("hello");
    expect(result[0].value?.hello).toBe("world");
  });
});

describe("CRDT with a multi-write", function () {
  interface CRDTTestType {
    readonly points: number;
  }
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
  });
  it("return the records on get", async () => {
    const { doc } = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    const got2 = (await crdt.get("king")) as DocValue<CRDTTestType>;
    expect(got2).toBeTruthy();
    expect(got2.doc.points).toBe(10);
  });
  it("should accept another put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "queen", value: { points: 10 } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const got = (await crdt.get("queen")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.points).toBe(10);
  });
  it("should offer changes", async () => {
    const { result } = await crdt.changes<CRDTTestType>([]);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
    expect(result[0].value?.points).toBe(11);
    expect(result[1].id).toBe("king");
  });
  it("should offer changes since", async () => {
    /** @type {CRDTMeta} */
    const secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
    expect(secondPut.head).toBeTruthy();
    const { result: r2, head: h2 } = await crdt.changes<CRDTTestType>();
    expect(r2.length).toBe(4);
    const { result: r3 } = await crdt.changes(firstPut.head);
    expect(r3.length).toBe(2);
    const { result: r4 } = await crdt.changes(h2);
    expect(r4.length).toBe(0);
  });
});

interface CRDTTestType {
  readonly points: number;
}
describe("CRDT with two multi-writes", function () {
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  let secondPut: CRDTMeta;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `test-multiple-writes@${sthis.nextId().str}`),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
    expect(secondPut.head.length).toBe(1);
    expect(firstPut.head[0]).not.toBe(secondPut.head[0]);
  });
  it("return the records on get", async () => {
    const ret = await crdt.get("ace");
    expect(ret).not.toBeNull();
    const { doc } = ret as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    for (const key of ["king", "queen", "jack"]) {
      const { doc } = (await crdt.get(key)) as DocValue<CRDTTestType>;
      expect(doc.points).toBe(10);
    }
  });
  it("should offer changes", async () => {
    const { result } = await crdt.changes<CRDTTestType>();
    expect(result.length).toBe(4);
    expect(result[0].id).toBe("ace");
    expect(result[0].value?.points).toBe(11);
    expect(result[1].id).toBe("king");
    expect(result[2].id).toBe("queen");
    expect(result[3].id).toBe("jack");
  });
});

describe("Compact a named CRDT with writes", function () {
  let crdt: CRDT;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    // sthis.env.set(
    //   "FP_STORAGE_URL",
    //   BuildURI.from(sthis.env.get("FP_STORAGE_URL")).setParam(PARAM.STORE_KEY, "insecure").toString(),
    // );
    // console.log("FP_STORAGE_URL", sthis.env.get("FP_STORAGE_URL"));
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `named-crdt-compaction-${sthis.nextId().str}`),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    for (let i = 0; i < 10; i++) {
      const bulk = [
        { id: "ace", value: { points: 11 } },
        { id: "king", value: { points: 10 } },
      ];
      await crdt.bulk(bulk);
    }
    // await sleep(1000);
  });
  it("has data", async () => {
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should start with blocks", async () => {
    const blz: AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    //    expect(blz.map((i) => sthis.txt.decode(i.bytes) + "\n=================\n")).toEqual([
    //
    //    ])
    expect(blz.map((i) => i.cid.toString())).toEqual([
      "bafyreicuomyooryb747esregkhooc4phr656tocowyo6dwcocq22h7qdhu",
      "bafyreig5jhovaiocwk3vfafzdspgtwinftjygyghjzigkc554muhdmp5ba",
      "bafyreiegj7yumreue7llzqroebigscedyzrkeir3zneg5q7zia77itowy4",
      "bafyreihobual6tt3hgdfve4h5uzt7fey62se3dfecbuj6f4ndkkwquke4u",
      "bafyreibqqcs3r6mhpr3525na6jtqnjcf6dmgskk27x4a2jb3r2qveqgexm",
      "bafyreibr7udlekt4xgavn54i4zfsdlrmi4r76iq6gh3bdq4xh52px6to3e",
      "bafyreidg2eyas62nvwvi6ggq44tsldj4kwmupyk2xtwmxbwf77g3noqtp4",
      "bafyreigbzxzj4eh7ljfvzlc7smdextuuk7gvep5mpnb3igaj5r2qzjlfye",
      "bafyreicr7takuntpofvk52xerdcoiq7wdt73ef54acoya2geig2ywkqlsi",
      "bafyreihmmgm5sufvnsgjic4fbizkdbajpy2yrklyieadstbtegfr4qko2m",
      "bafyreibnu44uyu3ggqwgmnlxodw6dyta3qg7e5qldsjq7bkbv452ova6oa",
      "bafyreieh4nlzg7enfczmj4z7uxvgrnykh7ajw7crxjrncqfrzj47ip6t6m",
      "bafyreigqqrccymfvvdfetjd2twsdzjwxbb6cn6tedqntvpgp5vboky2ol4",
      "bafyreid6kkobhgdmce2cyroepyos3jwumtdrfuzi6suldlxzjsgagc3fvi",
      "bafyreibo2d56wo5ldey24hygtmsfhdxsqgdpmtne5oitehxjppipru33ma",
      "bafyreifjv6havcza3is7w6ii345f5akba7e34xqcxwoqozmsnihkivykum",
      "bafyreig6eroqeg3y7am4bnrun3yzbvd656epzxjyivdpzwqo3j3vpuwysi",
      "bafyreibpsnfsducp7refempcyqnte54j7ueh4ysdlabggihclbddfnuzxm",
      "bafyreicfkkygbzz5zawr3xbfah2gy3e7w4opzysew4tini7xnksujj4gf4",
      "bafyreiddjm5xkpfa5vmyhoj5opocrwo6zbdnmqyhouc5ttfxoilmaf25bm",
      "bafyreibp7vlgfexaknaoxpemnnwadyfa4cfuc3euzlkslskks2n44wwspu",
      "bafyreichwj7izzpxeyjkhwl26pq45m4hnhxcgzqfk5ffeqkscafleiwfzm",
      "bafyreidzjjqou36q2ghqdue4buq7536w4sl5aejni6tw25mzsusl26gtwu",
      "bafyreibxibqhi6wh5klrje7ne4htffeqyyqfd6y7x2no6wnhid4nixizau",
      "bafyreidnvv4mwvweup5w52ddre2sl4syhvczm6ejqsmuekajowdl2cf2q4",
      "bafyreihh6nbfbhgkf5lz7hhsscjgiquw426rxzr3fprbgonekzmyvirrhe",
      "bafyreiejg3twlaxr7gfvvhtxrhvwaydytdv4guidmtvaz5dskm6gp73ryi",
      "bafyreiblui55o25dopc5faol3umsnuohb5carto7tot4kicnkfc37he4h4",
    ]);
    // expect(blz.length).toBe(13);
  }, 1000000);
  it("should start with changes", async () => {
    const { result } = await crdt.changes();
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
  });
  it.skip("should have fewer blocks after compact", async () => {
    await crdt.compact();
    const blz: AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toBe(23);
  });
  it("should have data after compact", async () => {
    await crdt.compact();
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should have changes after compact", async () => {
    const chs = await crdt.changes();
    expect(chs.result[0].id).toBe("ace");
  });
});

describe("CRDT with an index", function () {
  let crdt: CRDT;
  let idx: Index<CRDTTestType, number>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    idx = await index<CRDTTestType, number>(crdt, "points");
  });
  it("should query the data", async () => {
    const got = await idx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it("should register the index", async () => {
    const rIdx = await index<CRDTTestType, number>(crdt, "points");
    expect(rIdx).toBeTruthy();
    expect(rIdx.name).toBe("points");
    const got = await rIdx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it.skip("creating a different index with same name should not work", async () => {
    const e = await index(crdt, "points", (doc) => doc._id)
      .query()
      .catch((err) => err);
    expect(e.message).toMatch(/cannot apply/);
  });
});

describe("Loader with a committed transaction", function () {
  let loader: Loader;
  let blockstore: EncryptedBlockstore;
  let crdt: CRDT;
  let done: CRDTMeta;
  const dbname = "test-loader";
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, dbname),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as Loader;
    done = await crdt.bulk([{ id: "foo", value: { foo: "bar" } }]);
  });
  // it("should have a name", function () {
  //   expect(loader.ebOpts.storeUrls).toEqual({
  //     data: "file://./dist/fp-dir-file?name=test-loader&store=data&storekey=%40test-loader-data%40&suffix=.car&urlGen=fromEnv",
  //     file: "file://./dist/fp-dir-file?name=test-loader&store=data&storekey=%40test-loader-data%40&urlGen=fromEnv",
  //     meta: "file://./dist/fp-dir-file?name=test-loader&store=meta&storekey=%40test-loader-meta%40&urlGen=fromEnv",
  //     wal: "file://./dist/fp-dir-file?name=test-loader&store=wal&storekey=%40test-loader-wal%40&urlGen=fromEnv",
  //   });
  // });
  it("should commit a transaction", function () {
    expect(done.head).toBeTruthy();
    // expect(done.cars).toBeTruthy();
    expect(loader.carLog.length).toBe(1 + 1 /* genesis */);
  });
  it("can load the car", async () => {
    const blk = loader.carLog.asArray()[0][0];
    expect(blk).toBeTruthy();
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isCarBlockItemReady(reader));
    const parsed = await parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(0 + 1 /* genesis */);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

describe("Loader with two committed transactions", function () {
  let loader: Loader;
  let crdt: CRDT;
  let blockstore: EncryptedBlockstore;
  let done1: CRDTMeta;
  let done2: CRDTMeta;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-loader"),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as Loader;
    done1 = await crdt.bulk([{ id: "apple", value: { foo: "bar" } }]);
    done2 = await crdt.bulk([{ id: "orange", value: { foo: "bar" } }]);
  });
  it("should commit two transactions", function () {
    expect(done1.head).toBeTruthy();
    // expect(done1.cars).toBeTruthy();
    expect(done2.head).toBeTruthy();
    // expect(done2.cars).toBeTruthy();
    expect(done1.head).not.toBe(done2.head);
    // expect(done1.cars).not.toBe(done2.cars);
    // expect(blockstore.transactions.size).toBe(2);
    expect(loader.carLog.length).toBe(2 + 1 /* genesis */);
    // expect(loader.carLog.indexOf(done1.cars)).toBe(1);
    // expect(loader.carLog.map((cs) => cs.toString()).indexOf(done1.cars.toString())).toBe(1);
    // expect(loader.carLog.indexOf(done2.cars)).toBe(0);
    // expect(loader.carLog.map((cs) => cs.toString()).indexOf(done2.cars.toString())).toBe(0);
  });
  it("can load the car", async () => {
    const blk = loader.carLog.asArray()[0][0];
    expect(blk).toBeTruthy();
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isCarBlockItemReady(reader));
    const parsed = await parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(1 + 1 /* genesis */);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

describe("Loader with many committed transactions", function () {
  let loader: Loader;
  let blockstore: EncryptedBlockstore;
  let crdt: CRDT;
  let dones: CRDTMeta[];
  const count = 10;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-loader-many"),
      storeEnDe: ensureStoreEnDeFile({}),
      ctx: new AppContext(),
      tracer,
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as Loader;
    dones = [];
    for (let i = 0; i < count; i++) {
      const did = await crdt.bulk([{ id: `apple${i}`, value: { foo: "bar" } }]);
      dones.push(did);
    }
  });
  it("should commit many transactions", function () {
    for (const done of dones) {
      expect(done.head).toBeTruthy();
      // expect(done.cars).toBeTruthy();
    }
    expect(blockstore.transactions.size).toBe(0); // cleaned up on commit
    expect(loader.carLog.length).toBe(count + 1 /* genesis */);
  });
  it("can load the car", async () => {
    const blk = loader.carLog.asArray()[2][0];
    // expect(dones[5].cars).toBeTruthy();
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isCarBlockItemReady(reader));
    const parsed = await parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(7 + 1 /* genesis */);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});
