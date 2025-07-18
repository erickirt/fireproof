import {
  CTCryptoKey,
  KeyedResolvOnce,
  Logger,
  ResolveOnce,
  ResolveSeq,
  Result,
  runtimeFn,
  toCryptoRuntime,
  URI,
} from "@adviser/cement";
import { KeyMaterial, KeysByFingerprint, KeyUpsertResult, KeyWithFingerPrint } from "@fireproof/core-types-blockstore";
import { ensureLogger } from "@fireproof/core-runtime";
import { base58btc } from "multiformats/bases/base58";
import {
  KeyBagIf,
  KeyBagOpts,
  KeyBagProvider,
  KeyBagRuntime,
  KeysItem,
  PARAM,
  SuperThis,
  V1StorageKeyItem,
  V2StorageKeyItem,
} from "@fireproof/core-types-base";
import { KeyBagProviderFile } from "@fireproof/core-gateways-file";
import { KeyBagProviderMemory } from "./key-bag-memory.js";

class keyWithFingerPrint implements KeyWithFingerPrint {
  readonly default: boolean;
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;

  private kfp: KeyWithFingerPrint;

  #material: string;

  constructor(kfp: KeyWithFingerPrint, material: string | Uint8Array, def: boolean) {
    this.kfp = kfp;
    this.key = kfp.key;
    this.fingerPrint = kfp.fingerPrint;
    this.default = def;
    if (material instanceof Uint8Array) {
      this.#material = base58btc.encode(material);
    } else if (typeof material === "string") {
      this.#material = material;
    } else {
      throw new Error("material must be string or Uint8Array");
    }
  }

  extract(): Promise<KeyMaterial> {
    return this.kfp.extract();
  }

  async asV2StorageKeyItem(): Promise<V2StorageKeyItem> {
    return {
      default: this.default,
      fingerPrint: this.fingerPrint,
      key: this.#material,
    };
  }
}

export async function toKeyWithFingerPrint(
  keybag: KeyBag,
  materialStrOrUint8: string | Uint8Array,
): Promise<Result<KeyWithFingerPrint>> {
  let material: Uint8Array;
  if (typeof materialStrOrUint8 === "string") {
    material = base58btc.decode(materialStrOrUint8);
  } else {
    material = materialStrOrUint8;
  }
  const key = await keybag.subtleKey(material);
  const fpr = await keybag.rt.crypto.digestSHA256(material);
  return Result.Ok({
    key,
    fingerPrint: base58btc.encode(new Uint8Array(fpr)),
    extract: async () => {
      if (key.extractable) {
        return {
          key: material,
          keyStr: base58btc.encode(material),
        };
      }
      throw new Error("Key is not extractable");
    },
  });
}

export class keysByFingerprint implements KeysByFingerprint {
  readonly keys: Record<string, keyWithFingerPrint> = {};
  readonly keybag: KeyBag;
  readonly name: string;
  readonly id: string;

  static async from(keyBag: KeyBag, named: KeysItem): Promise<KeysByFingerprint> {
    const kbf = new keysByFingerprint(keyBag, named.name);
    // reverse to keep the first key as default
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, v2] of Object.entries(named.keys).reverse()) {
      const result = await kbf.upsert(v2.key, v2.default);
      if (result.isErr()) {
        throw result;
      }
      // if (result.Ok().modified) {
      //   throw keyBag.logger.Error().Msg("KeyBag: keysByFingerprint: mismatch unexpected").AsError();
      // }
      if (result.Ok().kfp.fingerPrint !== v2.fingerPrint) {
        throw keyBag.logger
          .Error()
          .Any("fprs", {
            fromStorage: v2.fingerPrint,
            calculated: result.Ok().kfp.fingerPrint,
          })
          .Msg("KeyBag: keysByFingerprint: mismatch")
          .AsError();
      }
    }
    return kbf;
  }

  constructor(keyBag: KeyBag, name: string) {
    this.keybag = keyBag;
    this.name = name;
    this.id = keyBag.rt.sthis.nextId(4).str;
  }

  async get(fingerPrint?: Uint8Array | string): Promise<KeyWithFingerPrint | undefined> {
    if (fingerPrint instanceof Uint8Array) {
      fingerPrint = base58btc.encode(fingerPrint);
    } else {
      fingerPrint = fingerPrint || "*";
    }
    const found = this.keys[fingerPrint];
    if (found) {
      return found;
    }
    throw this.keybag.logger
      .Error()
      .Any({ fprs: Object.keys(this.keys), fpr: fingerPrint, name: this.name, id: this.id })
      .Msg("keysByFingerprint:get: not found")
      .AsError();
  }

  async upsert(materialStrOrUint8: string | Uint8Array, def?: boolean, keyBagAction = true): Promise<Result<KeyUpsertResult>> {
    def = !!def;
    const rKfp = await toKeyWithFingerPrint(this.keybag, materialStrOrUint8);
    // console.log("upsert", this.id, this.name, rKfp.Ok().fingerPrint)
    if (rKfp.isErr()) {
      return Result.Err(rKfp);
    }
    const kfp = rKfp.Ok();
    let found = this.keys[kfp.fingerPrint];
    if (found) {
      if (found.default === def) {
        // console.log("upsert-def", this.name, found.fingerPrint);
        return Result.Ok({
          modified: false,
          kfp: found,
        });
      }
    } else {
      found = new keyWithFingerPrint(kfp, materialStrOrUint8, def);
    }
    if (def) {
      for (const i of Object.values(this.keys)) {
        (i as { default: boolean }).default = false;
      }
    }
    // console.log("upsert", this.name, found.fingerPrint, found, keyBagAction);
    this.keys[kfp.fingerPrint] = found;
    if (def) {
      this.keys["*"] = found;
    }
    if (keyBagAction) {
      // console.log("_upsertNamedKey", this.name, found.fingerPrint);
      this.keybag._upsertNamedKey(this);
    }
    return Result.Ok({
      modified: keyBagAction && true,
      kfp: found,
    });
  }

  async asKeysItem(): Promise<KeysItem> {
    const my = { ...this.keys };
    delete my["*"];
    const kis = await Promise.all(Object.values(my).map((i) => i.asV2StorageKeyItem()));
    return {
      name: this.name,
      keys: kis.reduce(
        (acc, i) => {
          acc[i.fingerPrint] = i;
          return acc;
        },
        {} as Record<string, V2StorageKeyItem>,
      ),
    };
  }

  // async extract() {
  //   const ext = new Uint8Array((await this.rt.crypto.exportKey("raw", named.key)) as ArrayBuffer);
  //   return {
  //     key: ext,
  //     keyStr: base58btc.encode(ext),
  //   };
  // }
}

export class KeyBag implements KeyBagIf {
  readonly logger: Logger;
  readonly rt: KeyBagRuntime;

  constructor(rt: KeyBagRuntime) {
    this.rt = rt;
    this.logger = ensureLogger(rt.sthis, "KeyBag");
  }

  readonly _warnOnce: ResolveOnce<void> = new ResolveOnce<void>();
  async subtleKey(materialStrOrUint8: string | Uint8Array): Promise<CryptoKey> {
    const extractable = this.rt.url.getParam(PARAM.EXTRACTKEY) === "_deprecated_internal_api";
    if (extractable) {
      this._warnOnce.once(() =>
        this.logger.Warn().Msg("extractKey is enabled via _deprecated_internal_api --- handle keys safely!!!"),
      );
    }
    let material: Uint8Array;
    if (typeof materialStrOrUint8 === "string") {
      material = base58btc.decode(materialStrOrUint8);
    } else {
      material = materialStrOrUint8;
    }
    return await this.rt.crypto.importKey(
      "raw", // raw or jwk
      material,
      // hexStringToUint8Array(key), // raw data
      "AES-GCM",
      extractable,
      ["encrypt", "decrypt"],
    );
  }

  async ensureKeyFromUrl(url: URI, keyFactory: () => string): Promise<Result<URI>> {
    // add storekey to url
    const storeKey = url.getParam(PARAM.STORE_KEY);
    if (storeKey === "insecure") {
      return Result.Ok(url);
    }
    if (!storeKey) {
      const keyName = `@${keyFactory()}@`;
      const ret = await this.getNamedKey(keyName);
      if (ret.isErr()) {
        return Result.Err(ret);
      }
      const urb = url.build().setParam(PARAM.STORE_KEY, keyName);
      return Result.Ok(urb.URI());
    }
    if (storeKey.startsWith("@") && storeKey.endsWith("@")) {
      const ret = await this.getNamedKey(storeKey);
      if (ret.isErr()) {
        return Result.Err(ret);
      }
    }
    return Result.Ok(url);
  }

  private async toKeysItem(ki: V1StorageKeyItem | KeysItem | undefined): Promise<KeysItem | undefined> {
    if (!ki) return undefined;
    if ("key" in ki) {
      const fpr = (await toKeyWithFingerPrint(this, ki.key)).Ok().fingerPrint;
      return {
        name: ki.name,
        keys: {
          [fpr]: {
            key: ki.key,
            fingerPrint: fpr,
            default: true,
          },
        },
      };
    }
    // fix default
    let defKI: V2StorageKeyItem | undefined;
    let foundDefKI = false;
    for (const i of Object.entries(ki.keys)) {
      if (i[0] !== i[1].fingerPrint) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ki.keys[i[0]];
        ki.keys[i[1].fingerPrint] = i[1];
        this.logger.Warn().Str("name", ki.name).Msg("fingerPrint mismatch fixed");
      }
      if (defKI === undefined) {
        defKI = i[1];
      }
      if (!foundDefKI && i[1].default) {
        defKI = i[1];
        foundDefKI = true;
      } else {
        (i[1] as { default: boolean }).default = false;
      }
    }
    if (defKI) {
      ki.keys["*"] = defKI;
    }
    return {
      name: ki.name,
      keys: ki.keys,
    };
  }

  flush(): Promise<void> {
    return this._seq.flush();
  }

  readonly _seq: ResolveSeq<Result<KeysByFingerprint>> = new ResolveSeq<Result<KeysByFingerprint>>();
  // async setNamedKey(name: string, key: string, def?: boolean): Promise<Result<KeysByFingerprint>> {
  //   return this._seq.add(() => this._upsertNamedKey(name, key, !!def));
  // }

  // avoid deadlock
  async _upsertNamedKey(ksi: KeysByFingerprint): Promise<Result<KeysByFingerprint>> {
    const bag = await this.rt.getBagProvider();
    return this._seq.add(async () => {
      const rKbf = await this._getNamedKey(ksi.name, true);
      if (rKbf.isErr()) {
        this.logger.Error().Err(rKbf).Str("name", ksi.name).Msg("_upsertNamedKey: getNamedKey failed");
        // we updated the cache
        this._namedKeyCache.unget(ksi.name);
      }
      await bag.set(await ksi.asKeysItem());
      return Result.Ok(ksi);
    });
  }

  // async getNamedExtractableKey(name: string, failIfNotFound = false): Promise<Result<KeysByFingerprint>> {
  //   const ret = await this.getNamedKey(name, failIfNotFound);
  //   if (ret.isErr()) {
  //     return Result.Err(ret)
  //   }
  //   const named = ret.Ok();
  //   return Result.Ok({
  //     ...named,
  //     extract: async () => {
  //       const ext = new Uint8Array((await this.rt.crypto.exportKey("raw", named.key)) as ArrayBuffer);
  //       return {
  //         key: ext,
  //         keyStr: base58btc.encode(ext),
  //       };
  //     },
  //   });
  // }

  private _namedKeyCache = new KeyedResolvOnce<Result<KeysByFingerprint>>();

  private async _getNamedKey(
    name: string,
    failIfNotFound: boolean,
    material?: string | Uint8Array,
  ): Promise<Result<KeysByFingerprint>> {
    return await this._namedKeyCache.get(name).once(async () => {
      const id = this.rt.sthis.nextId(4).str;
      const bag = await this.rt.getBagProvider();
      const named = await this.toKeysItem(await bag.get(name));
      if (named) {
        this.logger.Debug().Str("id", id).Str("name", name).Any("fprs", Object.keys(named.keys)).Msg("fingerPrint getNamedKey");
        return Result.Ok(await keysByFingerprint.from(this, named));
      }
      if (!named && failIfNotFound) {
        // do not cache
        this._namedKeyCache.unget(name);
        return this.logger.Debug().Str("id", id).Str("name", name).Msg("failIfNotFound getNamedKey").ResultError();
      }

      const kp = new keysByFingerprint(this, name);
      let keyMaterial: Uint8Array;
      if (!material) {
        keyMaterial = this.rt.crypto.randomBytes(this.rt.keyLength);
      } else {
        if (typeof material === "string") {
          keyMaterial = base58btc.decode(material);
        } else if (material instanceof Uint8Array) {
          keyMaterial = material;
        } else {
          return this.logger.Error().Msg("material must be string or Uint8Array").ResultError();
        }
      }
      const res = await kp.upsert(keyMaterial, true);
      if (res.isErr()) {
        return Result.Err(res);
      }
      // this.logger.Debug().Str("id", id).Str("name", name).Msg("createKey getNamedKey-pre");
      // const ret = await this._upsertNamedKey(name, base58btc.encode(this.rt.crypto.randomBytes(this.rt.keyLength)), true);
      this.logger.Debug().Str("id", id).Str("name", name).Str("fpr", res.Ok().kfp.fingerPrint).Msg("createKey getNamedKey-post");
      return Result.Ok(kp);
    });
  }

  async getNamedKey(name: string, failIfNotFound = false, material?: string | Uint8Array): Promise<Result<KeysByFingerprint>> {
    return this._seq.add(async () => {
      return await this._getNamedKey(name, failIfNotFound, material);
    });
  }
}

export type KeyBagFile = Record<string, KeysItem>;

export function isV1StorageKeyItem(item: V1StorageKeyItem | KeysItem): item is V1StorageKeyItem {
  return !!(item as V1StorageKeyItem).key;
}

export function isKeysItem(item: V1StorageKeyItem | KeysItem): item is KeysItem {
  return !!(item as KeysItem).keys;
}

export type KeyBackProviderFactory = (url: URI, sthis: SuperThis) => Promise<KeyBagProvider>;

export interface KeyBagProviderFactoryItem {
  readonly protocol: string;
  // if this is set the default protocol selection is overridden
  readonly override?: boolean;
  readonly factory: KeyBackProviderFactory;
}

const keyBagProviderFactories = new Map<string, KeyBagProviderFactoryItem>(
  [
    {
      protocol: "file:",
      factory: async (url: URI, sthis: SuperThis) => {
        return new KeyBagProviderFile(url, sthis);
      },
    },
    {
      protocol: "indexeddb:",
      factory: async (url: URI, sthis: SuperThis) => {
        const { KeyBagProviderImpl } = await import("@fireproof/core-gateways-indexeddb");
        return new KeyBagProviderImpl(url, sthis);
      },
    },
    {
      protocol: "memory:",
      factory: async (url: URI, sthis: SuperThis) => {
        return new KeyBagProviderMemory(url, sthis);
      },
    },
  ].map((i) => [i.protocol, i]),
);

export function registerKeyBagProviderFactory(item: KeyBagProviderFactoryItem) {
  const protocol = item.protocol.endsWith(":") ? item.protocol : item.protocol + ":";
  keyBagProviderFactories.set(protocol, {
    ...item,
    protocol,
  });
}

export function defaultKeyBagUrl(sthis: SuperThis): URI {
  let bagFnameOrUrl = sthis.env.get("FP_KEYBAG_URL");
  let url: URI;
  if (runtimeFn().isBrowser) {
    url = URI.from(bagFnameOrUrl || "indexeddb://fp-keybag");
  } else {
    if (!bagFnameOrUrl) {
      const home = sthis.env.get("HOME");
      bagFnameOrUrl = `${home}/.fireproof/keybag`;
      url = URI.from(`file://${bagFnameOrUrl}`);
    } else {
      url = URI.from(bagFnameOrUrl);
    }
  }
  const logger = ensureLogger(sthis, "defaultKeyBagUrl");
  logger.Debug().Url(url).Msg("from env");
  return url;
}

export function defaultKeyBagOpts(sthis: SuperThis, kbo?: Partial<KeyBagOpts>): KeyBagRuntime {
  kbo = kbo || {};
  if (kbo.keyRuntime) {
    return kbo.keyRuntime;
  }
  const logger = ensureLogger(sthis, "KeyBag");
  let url: URI;
  if (kbo.url) {
    url = URI.from(kbo.url);
    logger.Debug().Url(url).Msg("from opts");
  } else {
    let bagFnameOrUrl = sthis.env.get("FP_KEYBAG_URL");
    if (runtimeFn().isBrowser) {
      url = URI.from(bagFnameOrUrl || "indexeddb://fp-keybag");
    } else {
      if (!bagFnameOrUrl) {
        const home = sthis.env.get("HOME");
        bagFnameOrUrl = `${home}/.fireproof/keybag`;
        url = URI.from(`file://${bagFnameOrUrl}`);
      } else {
        url = URI.from(bagFnameOrUrl);
      }
    }
    logger.Debug().Url(url).Msg("from env");
  }
  const kitem = keyBagProviderFactories.get(url.protocol);
  if (!kitem) {
    throw logger.Error().Url(url).Msg("unsupported protocol").AsError();
  }

  if (url.hasParam("masterkey")) {
    throw logger.Error().Url(url).Msg("masterkey is not supported").AsError();
  }

  return {
    url,
    crypto: kbo.crypto || toCryptoRuntime({}),
    sthis,
    logger,
    keyLength: kbo.keyLength || 16,
    getBagProvider: () => kitem.factory(url, sthis),
    id: () => {
      return url.toString();
    },
  };
}

const _keyBags = new KeyedResolvOnce<KeyBag>();
export async function getKeyBag(sthis: SuperThis, kbo: Partial<KeyBagOpts> = {}): Promise<KeyBag> {
  await sthis.start();
  const rt = defaultKeyBagOpts(sthis, kbo);
  return _keyBags.get(rt.id()).once(async () => new KeyBag(rt));
}
