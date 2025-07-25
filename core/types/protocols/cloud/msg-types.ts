import { Future, Logger, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { CalculatePreSignedUrl } from "./msg-types-data.js";
import type { JWTPayload } from "jose";
// import { PreSignedMsg } from "./pre-signed-url.js";

export const VERSION = "FP-MSG-1.0";

export interface BaseTokenParam {
  readonly alg: string; // defaults ES256
  readonly issuer: string;
  readonly audience: string;
  readonly validFor: number;
}

export type ReadWrite = "read" | "write";

export function toReadWrite(i?: string): ReadWrite {
  if (!i) {
    return "read";
  }
  switch (i.toLowerCase()) {
    case "write":
      return "write";
    default:
      return "read";
  }
}

export type Role = "admin" | "owner" | "member";

export function toRole(i?: string): Role {
  if (!i) {
    return "member";
  }
  switch (i.toLowerCase()) {
    case "admin":
      return "admin";
    case "owner":
      return "owner";
    default:
      return "member";
  }
}

interface TenantClaim {
  readonly id: string;
  readonly role: Role;
}

interface LedgerClaim {
  readonly id: string;
  readonly role: Role;
  readonly right: ReadWrite;
}

// export type RoleClaim = TenantClaim | LedgerClaim;

export interface FPCloudClaim extends JWTPayload {
  readonly userId: string;
  readonly email: string;
  readonly nickname?: string;
  readonly provider?: "github" | "google";
  readonly created: Date;
  readonly tenants: TenantClaim[];
  readonly ledgers: LedgerClaim[];
  readonly selected: TenantLedger;
}

// export interface FPWaitTokenResult {
//   readonly type: "FPWaitTokenResult";
//   readonly token: string;
// }

// export function isFPWaitTokenResult(r: unknown): r is FPWaitTokenResult {
//   return typeof r === "object" && !!r && (r as FPWaitTokenResult).type === "FPWaitTokenResult";
// }

export type TokenForParam = FPCloudClaim & Partial<BaseTokenParam>;

export type MsgWithError<T extends MsgBase> = T | ErrorMsg;

export interface PreSignedMsg extends MsgWithTenantLedger<MsgWithConn> {
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
}

export interface MsgRawConnection<T extends MsgBase = MsgBase> {
  // readonly ws: WebSocket;
  // readonly params: ConnectionKey;
  // qsOpen: ReqRes<ReqOpen, ResOpen>;
  readonly sthis: SuperThis;
  // readonly exchangedGestalt: ExchangedGestalt;
  // readonly activeBinds: Map<string, ActiveStream<T, MsgBase>>;

  // readonly vconn: VirtualConnection;

  isReady: boolean;

  bind<S extends T, Q extends T>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>>;
  request<S extends T, Q extends T>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>>;
  send<S extends T, Q extends T>(msg: Q): Promise<MsgWithError<S>>;
  start(): Promise<Result<void>>;
  close(o: T): Promise<Result<void>>;
}

export interface RequestOpts {
  readonly waitFor: (msg: MsgBase) => boolean;
  readonly noConn?: boolean; // if true, no connection is required
  readonly pollInterval?: number; // 1000ms
  readonly timeout?: number; // ms
  readonly noRetry?: boolean;
  readonly rawConn?: MsgRawConnection;
}

export interface EnDeCoder {
  encode<T>(node: T): Uint8Array;
  decode<T>(data: Uint8Array): T;
}

export interface WaitForTid {
  readonly tid: string;
  readonly future: Future<MsgBase>;
  readonly timeout?: number;
  // undefined match all
  readonly waitFor: (msg: MsgBase) => boolean;
}

// export interface ConnId {
//   readonly connId: string;
// }
// type AddConnId<T extends MsgBase, N> = Omit<T, "type"> & ConnId & { readonly type: N };
export interface NextId {
  readonly nextId: SuperThis["nextId"];
}

export interface AuthType {
  readonly type: "ucan" | "error" | "fp-cloud-jwk" | "fp-cloud";
}

export function isAuthTypeFPCloudJWK(a: AuthType): a is FPJWKCloudAuthType {
  return a.type === "fp-cloud-jwk";
}

export function isAuthTypeFPCloud(a: AuthType): a is FPCloudAuthType {
  return a.type === "fp-cloud";
}

export interface UCanAuth extends AuthType {
  readonly type: "ucan";
  readonly params: {
    readonly tbd: string;
  };
}
export interface FPJWKCloudAuthType extends AuthType {
  readonly type: "fp-cloud-jwk";
  readonly params: {
    readonly jwk: string;
  };
}

export interface FPCloudAuthType extends AuthType {
  readonly type: "fp-cloud";
  readonly params: {
    readonly claim: TokenForParam;
    readonly jwk: string; // for reply
  };
}

export type AuthFactory = (tp?: Partial<TokenForParam>) => Promise<Result<AuthType>>;

export interface TenantLedger {
  readonly tenant: string;
  readonly ledger: string;
}

export function keyTenantLedger(t: TenantLedger): string {
  return `${t.tenant}:${t.ledger}`;
}

export interface QSId {
  readonly reqId: string;
  readonly resId: string;
}

export function qsidEqual(a: QSId, b: QSId): boolean {
  return a.reqId === b.reqId && a.resId === b.resId;
}

export function qsidKey(qsid: QSId): string {
  return `${qsid.reqId}:${qsid.resId}`;
}

// export interface Connection extends ReqResId{
//   readonly key: TenantLedger;
// }

// export interface Connected {
//   readonly conn: Connection;
// }

export interface MsgBase {
  readonly tid: string;
  readonly type: string;
  readonly version: string;
  readonly auth: AuthType;
}

export function MsgIsTid(msg: MsgBase, tid: string): boolean {
  return !msg.tid || msg.tid === tid;
}

export interface MsgConnAuth {
  readonly conn: QSId;
  readonly auth: AuthType;
}

export type MsgWithConn<T extends MsgBase = MsgBase> = T & { readonly conn: QSId };

export type MsgWithOptionalConn<T extends MsgBase = MsgBase> = T & { readonly conn?: Partial<QSId> };

// type MsgWithOptionalConn<T extends MsgBase = MsgBase> = T & { readonly conn?: QSId };

// export type MsgWithOptionalConnAuth<T extends MsgBase = MsgBase> = MsgWithOptionalConn<T> & { readonly auth: AuthType };

export type MsgWithOptionalTenantLedger<T extends MsgWithConn> = T & { readonly tenant?: Partial<TenantLedger> };
export type MsgWithTenantLedger<T extends MsgWithOptionalConn> = T & { readonly tenant: TenantLedger };

export type ErrorMsg = ErrorMsgBase | NotReadyErrorMsg;

export interface ErrorMsgBase extends MsgWithOptionalConn {
  readonly type: "error";
  readonly src: unknown;
  readonly message: string;
  readonly body?: string;
  readonly stack?: string[];
}

export interface NotReadyErrorMsg extends ErrorMsgBase {
  readonly reason: "not-ready";
  readonly src: "not-ready";
  readonly message: "Not Ready";
}

export function MsgIsNotReadyError(msg: MsgBase): msg is NotReadyErrorMsg {
  return MsgIsError(msg) && (msg as NotReadyErrorMsg).reason === "not-ready";
}

export function MsgIsError(rq: MsgBase): rq is ErrorMsg {
  return rq.type === "error";
}

export function MsgIsQSError(rq: ReqRes<MsgBase, MsgBase>): rq is ReqRes<ErrorMsg, ErrorMsg> {
  return rq.res.type === "error" || rq.req.type === "error";
}

export type HttpMethods = "GET" | "PUT" | "DELETE";
export type FPStoreTypes = "meta" | "car" | "wal" | "file";

export function coerceFPStoreTypes(s?: string): FPStoreTypes {
  const x = s?.trim();
  if (x === "meta" || x === "car" || x === "wal" || x === "file") {
    return x;
  }
  throw new Error(`Invalid FPStoreTypes: ${s}`);
}

// reqRes is http
// stream is WebSocket
export type ProtocolCapabilities = "reqRes" | "stream";

export function isProtocolCapabilities(s: string): s is ProtocolCapabilities {
  const x = s.trim();
  return x === "reqRes" || x === "stream";
}

export interface Gestalt {
  /**
   * Describes StoreTypes which are handled
   */
  readonly storeTypes: FPStoreTypes[];
  /**
   * A unique identifier
   */
  readonly id: string;
  /**
   * protocol capabilities
   * defaults "stream"
   */
  readonly protocolCapabilities: ProtocolCapabilities[];
  /**
   * HttpEndpoints (URL) required atleast one
   * could be absolute or relative
   */
  readonly httpEndpoints: string[];
  /**
   * WebsocketEndpoints (URL) required atleast one
   * could be absolute or relative
   */
  readonly wsEndpoints: string[];
  /**
   * Encodings supported
   * JSON, CBOR
   */
  readonly encodings: ("JSON" | "CBOR")[];
  /**
   * Authentication methods supported
   */
  readonly auth: AuthType[];
  /**
   * Requires Authentication
   */
  readonly requiresAuth: boolean;
  /**
   * In|Outband Data | Meta | WAL Support
   * Inband Means that the Payload is part of the message
   * Outband Means that the Payload is PUT/GET to a different URL
   * A Clien implementation usally not support reading or writing
   * support
   */
  readonly data?: {
    readonly inband: boolean;
    readonly outband: boolean;
  };
  readonly meta?: {
    readonly inband: true; // meta inband is mandatory
    readonly outband: boolean;
  };
  readonly wal?: {
    readonly inband: boolean;
    readonly outband: boolean;
  };
  /**
   * Request Types supported
   * reqGestalt, reqSubscribeMeta, reqPutMeta, reqGetMeta, reqDelMeta, reqUpdateMeta
   */
  readonly reqTypes: string[];
  /**
   * Response Types supported
   * resGestalt, resSubscribeMeta, resPutMeta, resGetMeta, resDelMeta, updateMeta
   */
  readonly resTypes: string[];
  /**
   * Event Types supported
   * updateMeta
   */
  readonly eventTypes: string[];
}

export interface MsgerParams {
  readonly mime: string;
  readonly auth?: AuthType;
  readonly hasPersistent?: boolean;
  readonly protocolCapabilities?: ProtocolCapabilities[];
  // readonly protocol: "http" | "ws";
  readonly timeout: number; // msec
}

// force the server id
export type GestaltParam = Partial<Gestalt> & { readonly id: string };

export function defaultGestalt(msgP: MsgerParams, gestalt: GestaltParam): Gestalt {
  return {
    storeTypes: ["meta", "file", "car", "wal"],
    httpEndpoints: ["/fp"],
    wsEndpoints: ["/ws"],
    encodings: ["JSON"],
    protocolCapabilities: msgP.protocolCapabilities || ["reqRes", "stream"],
    auth: [],
    requiresAuth: false,
    data: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    meta: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    wal: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    reqTypes: [
      "reqOpen",
      "reqGestalt",
      // "reqSignedUrl",
      "reqSubscribeMeta",
      "reqPutMeta",
      "reqBindMeta",
      "reqDelMeta",
      "reqPutData",
      "reqGetData",
      "reqDelData",
      "reqPutWAL",
      "reqGetWAL",
      "reqDelWAL",
      "reqUpdateMeta",
    ],
    resTypes: [
      "resOpen",
      "resGestalt",
      // "resSignedUrl",
      "resSubscribeMeta",
      "resPutMeta",
      "resGetMeta",
      "resDelMeta",
      "resPutData",
      "resGetData",
      "resDelData",
      "resPutWAL",
      "resGetWAL",
      "resDelWAL",
      "updateMeta",
    ],
    eventTypes: ["updateMeta"],
    ...gestalt,
  };
}

export interface ReqChat extends MsgWithConn {
  readonly type: "reqChat";
  readonly message: string;
  readonly targets: QSId[];
}
export interface ResChat extends MsgWithConn {
  readonly type: "resChat";
  readonly message: string;
  readonly targets: QSId[];
}

export function buildReqChat(sthis: NextId, auth: AuthType, conn: Partial<QSId>, message: string, targets?: QSId[]): ReqChat {
  return {
    tid: sthis.nextId().str,
    type: "reqChat",
    version: VERSION,
    auth,
    conn: conn as QSId, // to build on ReqOpenConn is fine
    message,
    targets: targets ?? [],
  };
}

export function buildResChat(req: ReqChat, conn?: QSId, message?: string, targets?: QSId[], auth?: AuthType): ResChat {
  return {
    ...req,
    auth: auth || req.auth,
    conn: conn || req.conn,
    message: message || req.message,
    targets: targets || req.targets,
    type: "resChat",
    version: VERSION,
  };
}

export function MsgIsReqChat(msg: MsgBase): msg is ReqChat {
  return msg.type === "reqChat";
}

export function MsgIsResChat(msg: MsgBase): msg is ResChat {
  return msg.type === "resChat";
}

/**
 * The ReqGestalt message is used to request the
 * features of the Responder.
 */
export interface ReqGestalt extends MsgBase {
  readonly type: "reqGestalt";
  readonly gestalt: Gestalt;
  readonly publish?: boolean; // for testing
}

export function MsgIsReqGestalt(msg: MsgBase): msg is ReqGestalt {
  return msg.type === "reqGestalt";
}

export function buildReqGestalt(sthis: NextId, auth: AuthType, gestalt: Gestalt, publish?: boolean): ReqGestalt {
  return {
    tid: sthis.nextId().str,
    auth,
    type: "reqGestalt",
    version: VERSION,
    gestalt,
    publish,
  };
}

export interface ConnInfo {
  readonly connIds: string[];
}
/**
 * The ResGestalt message is used to respond with
 * the features of the Responder.
 */
export interface ResGestalt extends MsgBase {
  readonly type: "resGestalt";
  readonly gestalt: Gestalt;
}

export function buildResGestalt(req: ReqGestalt, gestalt: Gestalt, auth: AuthType): ResGestalt | ErrorMsg {
  return {
    tid: req.tid,
    auth: auth || req.auth,
    type: "resGestalt",
    version: VERSION,
    gestalt,
  };
}

export function MsgIsResGestalt(msg: MsgBase): msg is ResGestalt {
  return msg.type === "resGestalt";
}

// export interface ReqOpenConnection {
//   // readonly key: TenantLedger;
//   readonly reqId?: string;
//   readonly resId?: string; // for double open
// }

export interface ReqOpenConn {
  readonly reqId: string;
  readonly resId?: string;
}

export interface ReqOpen extends Omit<MsgWithConn, "conn"> {
  readonly type: "reqOpen";
  readonly conn: ReqOpenConn;
}

export function buildReqOpen(sthis: NextId, auth: AuthType, conn: Partial<QSId>): ReqOpen {
  const req = {
    tid: sthis.nextId().str,
    auth,
    type: "reqOpen",
    version: VERSION,
    conn: {
      ...conn,
      reqId: conn.reqId || sthis.nextId().str,
    },
  } satisfies ReqOpen;
  return req;
}

// export function MsgIsReqOpenWithConn(imsg: MsgBase): imsg is MsgWithConn<ReqOpen> {
//   const msg = imsg as MsgWithConn<ReqOpen>;
//   return msg.type === "reqOpen" && !!msg.conn && !!msg.conn.reqId;
// }

export function MsgIsReqOpen(imsg: MsgBase): imsg is ReqOpen {
  const msg = imsg as MsgWithConn<ReqOpen>;
  return msg.type === "reqOpen" && !!msg.conn && !!msg.conn.reqId;
}

export interface ResOpen extends MsgBase {
  readonly type: "resOpen";
  readonly conn: QSId;
}

export function MsgIsWithConn<T extends MsgBase>(msg: T): msg is MsgWithConn<T> {
  const mwc = (msg as MsgWithConn<T>).conn;
  return mwc && !!(mwc as QSId).reqId && !!(mwc as QSId).resId;
}

export function MsgIsWithConnAuth<T extends MsgBase>(msg: T): msg is MsgWithConn<T> {
  return MsgIsWithConn(msg) && !!msg.auth && typeof msg.auth.type === "string";
}

export function MsgIsConnected<T extends MsgBase>(msg: T, qsid: QSId): msg is MsgWithConn<T> {
  return MsgIsWithConn(msg) && msg.conn.reqId === qsid.reqId && msg.conn.resId === qsid.resId;
}

export function buildResOpen(sthis: NextId, req: ReqOpen, resStreamId?: string): ResOpen {
  if (!(req.conn && req.conn.reqId)) {
    throw new Error("req.conn.reqId is required");
  }
  return {
    ...req,
    type: "resOpen",
    conn: {
      ...req.conn,
      resId: req.conn.resId || resStreamId || sthis.nextId().str,
    },
  };
}

export function MsgIsResOpen(msg: MsgBase): msg is ResOpen {
  return msg.type === "resOpen";
}

export interface ReqClose extends MsgWithConn {
  readonly type: "reqClose";
}

export function MsgIsReqClose(msg: MsgBase): msg is ReqClose {
  return msg.type === "reqClose" && MsgIsWithConn(msg);
}

export interface ResClose extends MsgWithConn {
  readonly type: "resClose";
}

export function MsgIsResClose(msg: MsgBase): msg is ResClose {
  return msg.type === "resClose" && MsgIsWithConn(msg);
}

export function buildResClose(req: ReqClose, conn: QSId): ResClose {
  return {
    ...req,
    type: "resClose",
    conn,
  };
}

export function buildReqClose(sthis: NextId, auth: AuthType, conn: QSId): ReqClose {
  return {
    tid: sthis.nextId().str,
    auth,
    type: "reqClose",
    version: VERSION,
    conn,
  };
}

export interface SignedUrlParam {
  // base path
  readonly path?: string;
  // name of the file
  readonly key: string;
  readonly expires?: number; // seconds
  readonly index?: string;
}

export interface MethodSignedUrlParam {
  readonly method: HttpMethods;
  readonly store: FPStoreTypes;
}

// export type ReqSignedUrlParam = Omit<SignedUrlParam, "method" | "store">;
export interface ReqSignedUrlParam {
  readonly auth: AuthType;
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
}

export interface UpdateReqRes<Q extends MsgBase, S extends MsgBase> {
  req: Q;
  res: S;
}

export type ReqRes<Q extends MsgBase, S extends MsgBase> = Readonly<UpdateReqRes<Q, S>>;

export function buildErrorMsg(
  msgCtx: { readonly logger: Logger; readonly sthis: SuperThis },
  base: Partial<MsgBase & { ref?: unknown }>,
  error: Error,
  body?: string,
  stack?: string[],
): ErrorMsg {
  if (!stack && msgCtx.sthis.env.get("FP_STACK")) {
    stack = error.stack?.split("\n");
  }
  const msg = {
    auth: base.auth || { type: "error" },
    src: base,
    type: "error",
    tid: base.tid || "internal",
    message: error.message,
    version: VERSION,
    body,
    stack,
  } satisfies ErrorMsg;
  msgCtx.logger.Any("ErrorMsg", msg);
  return msg;
}

export function MsgIsTenantLedger<T extends MsgBase>(msg: T): msg is MsgWithTenantLedger<MsgWithConn<T>> {
  if (MsgIsWithConnAuth(msg)) {
    const t = (msg as MsgWithTenantLedger<MsgWithConn<T>>).tenant;
    return !!t && !!t.tenant && !!t.ledger;
  }
  return false;
}

export interface MethodParams {
  readonly methodParam: MethodSignedUrlParam;
}

export interface SignedUrlParams {
  readonly urlParam: SignedUrlParam;
}

export type MethodSignedUrlParams = MethodParams & SignedUrlParams;

export type ReqSignedUrlWithoutMethodParams = SignedUrlParams & MsgWithTenantLedger<MsgWithConn>;
export type ReqSignedUrl = MethodSignedUrlParams & MsgWithTenantLedger<MsgWithOptionalConn>;

export interface GwCtx {
  readonly tid?: string;
  readonly conn: QSId;
  readonly tenant: TenantLedger;
}

export interface ReqGwCtx {
  readonly tid?: string;
  readonly conn: Partial<QSId>;
  readonly tenant: TenantLedger;
}

export interface GwCtxConn {
  readonly tid?: string;
  readonly conn: QSId;
  readonly tenant: TenantLedger;
}

export function buildReqSignedUrl<T extends ReqSignedUrl>(sthis: NextId, type: string, rparam: ReqSignedUrlParam, gwCtx: GwCtx): T {
  return {
    tid: sthis.nextId().str,
    type,
    auth: rparam.auth,
    version: VERSION,
    ...gwCtx,
    methodParam: rparam.methodParam,
    urlParam: rparam.urlParam,
  } satisfies ReqSignedUrl as T;
}

export interface ResSignedUrl extends MsgWithTenantLedger<MsgWithConn> {
  // readonly type: "resSignedUrl";
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
  readonly signedUrl: string;
}

export interface ResOptionalSignedUrl extends MsgWithTenantLedger<MsgWithConn> {
  // readonly type: "resSignedUrl";
  readonly urlParam: SignedUrlParam;
  readonly methodParam: MethodSignedUrlParam;
  readonly signedUrl?: string;
}

export interface MsgTypesCtx {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  // readonly auth: AuthFactory;
}

// export async function msgTypesCtxSync(msgCtx: MsgTypesCtx): Promise<MsgTypesCtxSync> {
//   return {
//     sthis: msgCtx.sthis,
//     logger: msgCtx.logger,
//     auth: await msgCtx.auth(),
//   };
// }

export interface MsgTypesCtxSync {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly auth: AuthType;
}

export function resAuth(msg: MsgBase): Promise<AuthType> {
  return msg.auth ? Promise.resolve(msg.auth) : Promise.reject(new Error("No Auth"));
}

export async function buildRes<Q extends MsgWithTenantLedger<MsgWithConn<ReqSignedUrlWithoutMethodParams>>, S extends ResSignedUrl>(
  methodParam: MethodSignedUrlParam,
  type: string,
  msgCtx: MsgTypesCtx,
  req: Q,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<S>> {
  const psm = {
    type: "reqSignedUrl",
    auth: await resAuth(req),
    version: req.version,
    methodParam,
    urlParam: {
      ...req.urlParam,
    },
    conn: req.conn,
    tenant: req.tenant,
    tid: req.tid,
  } satisfies PreSignedMsg;
  const rSignedUrl = await ctx.calculatePreSignedUrl(msgCtx, psm);
  if (rSignedUrl.isErr()) {
    return buildErrorMsg(msgCtx, req, rSignedUrl.Err());
  }
  return {
    ...req,
    urlParam: psm.urlParam,
    methodParam,
    type,
    signedUrl: rSignedUrl.Ok().toString(),
  } as unknown as MsgWithError<S>;
}
