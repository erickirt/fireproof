import { SuperThis, UnReg } from "@fireproof/core-types-base";
import { sts } from "@fireproof/core-runtime";

import { CORS } from "./hono-server.js";
import { WSRoom } from "./ws-room.js";
import {
  AuthType,
  buildErrorMsg,
  FPJWKCloudAuthType,
  isAuthTypeFPCloud,
  isAuthTypeFPCloudJWK,
  MsgBase,
  MsgIsError,
  MsgWithConn,
  MsgWithError,
  PreSignedMsg,
  QSId,
} from "@fireproof/core-types-protocols-cloud";
import { WSContextWithId, ExposeCtxItemWithImpl, HonoServerImpl } from "./types.js";

// type MsgBase = MsgBase;
// type MsgWithError<T extends MsgBase> = MsgWithError<T>;
// type QSId = QSId;
// type MsgWithConn<T extends MsgBase> = MsgWithConn<T>;
// type FPJWKCloudAuthType = FPJWKCloudAuthType;
// type AuthType = AuthType;
// type PreSignedMsg = PreSignedMsg;
// const { buildErrorMsg, isAuthTypeFPCloud, MsgIsError, isAuthTypeFPCloudJWK } = ps.cloud;

export interface MsgContext {
  calculatePreSignedUrl(p: PreSignedMsg): Promise<string>;
}

export interface WSPair {
  readonly client: WebSocket;
  readonly server: WebSocket;
}

export class WSConnectionPair {
  wspair?: WSPair;

  attachWSPair(wsp: WSPair) {
    if (!this.wspair) {
      this.wspair = wsp;
    } else {
      throw new Error("wspair already set");
    }
  }
}

export type Promisable<T> = T | Promise<T>;

// function WithValidConn<T extends MsgBase>(msg: T, rri?: ResOpen): msg is MsgWithConn<T> {
//   return MsgIsWithConn(msg) && !!rri && rri.conn.resId === msg.conn.resId && rri.conn.reqId === msg.conn.reqId;
// }

export interface ConnItem<T = unknown> {
  readonly id: string;
  readonly conns: QSId[];
  touched: Date;
  readonly ws?: WSContextWithId<T>;
}

// const connManager = new ConnectionManager();

export interface ConnectionInfo {
  readonly conn: WSConnectionPair;
  readonly reqId: string;
  readonly resId: string;
}

export interface MsgDispatcherCtx extends ExposeCtxItemWithImpl<WSRoom> {
  readonly id: string;
  readonly impl: HonoServerImpl;
  readonly sts: sts.SessionTokenService;
  // readonly auth: AuthFactory;
  readonly ws?: WSContextWithId<unknown>;
}

export interface MsgDispatchItem<S extends MsgBase, Q extends MsgBase> {
  readonly match: (msg: MsgBase) => boolean;
  readonly isNotConn?: boolean;
  fn(ctx: MsgDispatcherCtx, msg: Q): Promisable<MsgWithError<S>>;
}

export class MsgDispatcher {
  readonly sthis: SuperThis;
  // readonly logger: Logger;
  // // wsConn?: WSConnection;
  // readonly gestalt: Gestalt;
  readonly id: string;
  // readonly ende: EnDeCoder;

  // // readonly connManager = connManager;

  // readonly wsRoom: WSRoom;

  static new(sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/): MsgDispatcher {
    return new MsgDispatcher(sthis /*, gestalt, ende, wsRoom*/);
  }

  private constructor(sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/) {
    this.sthis = sthis;
    // this.logger = ensureLogger(sthis, "Dispatcher");
    // this.gestalt = gestalt;
    this.id = sthis.nextId().str;
    // this.ende = ende;
    // this.wsRoom = wsRoom;
  }

  // addConn(msg: MsgBase): Result<QSId> {
  //   if (!MsgIsReqOpenWithConn(msg)) {
  //     return this.logger.Error().Msg("msg missing reqId").ResultError();
  //   }
  //   return Result.Ok(connManager.addConn(msg.conn));
  // }

  readonly items = new Map<string, MsgDispatchItem<MsgBase, MsgBase>>();
  registerMsg(...iItems: MsgDispatchItem<MsgBase, MsgBase>[]): UnReg {
    const items = iItems.flat();
    const ids: string[] = items.map((item) => {
      const id = this.sthis.nextId(12).str;
      this.items.set(id, item);
      return id;
    });
    return () => ids.forEach((id) => this.items.delete(id));
  }

  send(ctx: MsgDispatcherCtx, msg: MsgBase) {
    const isError = MsgIsError(msg);
    const str = ctx.ende.encode(msg);
    // if (MsgIsResChat(msg)) {
    //   console.log("send", msg.tid, ctx.ws);
    // }
    ctx.ws?.send(str);
    return new Response(str, {
      status: isError ? 500 : 200,
      headers: CORS.AsHeaderInit(),
      statusText: isError ? "error" : "ok",
    });
  }

  async validateConn<T extends MsgBase>(
    ctx: MsgDispatcherCtx,
    msg: T,
    fn: (msg: MsgWithConn<T>) => Promisable<MsgWithError<MsgBase>>,
  ): Promise<MsgWithError<MsgBase>> {
    if (!ctx.wsRoom.isConnected(msg)) {
      return buildErrorMsg(ctx, { ...msg }, new Error("dispatch missing connection"));
      // return send(buildErrorMsg(this.sthis, this.logger, msg, new Error("non open connection")));
    }
    return this.validateAuth(ctx, msg, (msg) => fn(msg));
  }

  async validateAuth<T extends MsgBase>(
    ctx: MsgDispatcherCtx,
    msg: T,
    fn: (msg: T) => Promisable<MsgWithError<MsgBase>>,
  ): Promise<MsgWithError<MsgBase>> {
    if (msg.auth) {
      const rAuth = await ctx.impl.validateAuth(ctx, msg.auth);
      if (rAuth.isErr()) {
        return buildErrorMsg(ctx, msg, rAuth.Err());
      }
      const sMsg = await fn({
        ...msg,
        auth: rAuth.Ok(),
      });
      switch (true) {
        case isAuthTypeFPCloudJWK(sMsg.auth):
          return sMsg;
        case isAuthTypeFPCloud(sMsg.auth):
          return {
            ...sMsg,
            auth: {
              type: "fp-cloud-jwk",
              params: {
                jwk: sMsg.auth.params.jwk,
              },
            } satisfies FPJWKCloudAuthType as AuthType, // send me to hell ts
          };
        default:
          return buildErrorMsg(ctx, msg, new Error("unexpected auth"));
      }
    }
    return buildErrorMsg(ctx, msg, new Error("missing auth"));
  }

  async dispatch(ctx: MsgDispatcherCtx, msg: MsgBase): Promise<Response> {
    const res = await this.dispatchImpl(ctx, msg);
    return this.send(ctx, res);
  }

  private async dispatchImpl(ctx: MsgDispatcherCtx, msg: MsgBase): Promise<MsgWithError<MsgBase>> {
    // const id = this.sthis.nextId(12).str;
    try {
      const found = Array.from(this.items.values()).find((item) => item.match(msg));
      if (!found) {
        return buildErrorMsg(ctx, msg, new Error(`unexpected message`));
      }
      if (!found.isNotConn) {
        const ret = await this.validateConn(ctx, msg, (msg) => found.fn(ctx, msg));
        return ret;
      }
      return this.validateAuth(ctx, msg, (msg) => found.fn(ctx, msg));
    } catch (e) {
      return buildErrorMsg(ctx, msg, e as Error);
      // } finally {
      //   console.log("dispatch-5", id);
    }
  }
}
