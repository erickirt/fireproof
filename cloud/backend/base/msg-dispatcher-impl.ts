import { SuperThis } from "@fireproof/core-types-base";
import { MsgDispatcher, MsgDispatcherCtx } from "./msg-dispatch.js";
import { Promisable } from "@adviser/cement";
import * as ps from "@fireproof/core-types-protocols-cloud";
import { metaMerger } from "./meta-merger/meta-merger.js";

const {
  MsgIsReqGetData,
  buildResGetData,
  MsgIsReqPutData,
  MsgIsReqDelData,
  buildResDelData,
  buildResPutData,
  MsgIsReqDelWAL,
  MsgIsReqGetWAL,
  MsgIsReqPutWAL,
  buildResDelWAL,
  buildResGetWAL,
  buildResPutWAL,
  MsgIsReqGestalt,
  buildResGestalt,
  MsgIsReqOpen,
  buildErrorMsg,
  buildResOpen,
  buildResChat,
  MsgIsReqChat,
  qsidEqual,
  MsgIsReqClose,
  buildResClose,
  MsgIsBindGetMeta,
  MsgIsReqDelMeta,
  MsgIsReqPutMeta,
} = ps;

type ReqGetData = ps.ReqGetData;
type ReqPutData = ps.ReqPutData;
type ReqDelData = ps.ReqDelData;
type ReqDelWAL = ps.ReqDelWAL;
type ReqGetWAL = ps.ReqGetWAL;
type ReqPutWAL = ps.ReqPutWAL;
type ReqGestalt = ps.ReqGestalt;
type ReqChat = ps.ReqChat;
type ReqClose = ps.ReqClose;
type MsgWithConn<T extends ps.MsgBase> = ps.MsgWithConn<T>;
type BindGetMeta = ps.BindGetMeta;
type ReqDelMeta = ps.ReqDelMeta;
type ReqPutMeta = ps.ReqPutMeta;

// export type MsgWithConnAuthTendantLedger<T extends ps.MsgBase> = MsgWithConnAuth<T> & {
//   readonly tenantLedger: {
//     readonly tenant: string;
//     readonly ledger: string;
//   };
// }

export function ensureTendantLedger<T extends ps.MsgBase>(
  fn: (ctx: MsgDispatcherCtx, msg: ps.MsgWithOptionalTenantLedger<MsgWithConn<T>>) => Promisable<ps.MsgWithError<ps.MsgBase>>,
  // right: "read" | "write" = "write"
): (ctx: MsgDispatcherCtx, msg: MsgWithConn<T>) => Promisable<ps.MsgWithError<ps.MsgBase>> {
  return async (ctx, msg) => {
    if (!ps.isAuthTypeFPCloud(msg.auth)) {
      return buildErrorMsg(ctx, msg, new Error("ensureTendantLedger: needs auth with claim"));
    }
    const optionalTenantLedger = msg as ps.MsgWithOptionalTenantLedger<MsgWithConn<T>>;
    const tl = {
      tenant: optionalTenantLedger.tenant?.tenant ?? msg.auth.params.claim.selected.tenant,
      ledger: optionalTenantLedger.tenant?.ledger ?? msg.auth.params.claim.selected.ledger,
    } satisfies ps.TenantLedger;
    const tlMsg = { ...msg, auth: msg.auth, tenant: tl };

    if (!tlMsg.auth.params.claim.tenants.map((i) => i.id).includes(tl.tenant)) {
      return buildErrorMsg(
        ctx,
        msg,
        new Error(`ensureTendantLedger: missing tenant: ${tlMsg.tenant.tenant}:${msg.auth.params.claim.tenants.map((i) => i.id)}`),
      );
    }
    if (!msg.auth.params.claim.ledgers.map((i) => i.id).includes(tlMsg.tenant.ledger)) {
      return buildErrorMsg(
        ctx,
        msg,
        new Error(`ensureTendantLedger: missing ledger: ${tlMsg.tenant.ledger}:${msg.auth.params.claim.ledgers.map((i) => i.id)}`),
      );
    }
    /* need some read and write check here */
    const ret = await fn(ctx, msg);
    return ret;
  };
}

export function buildMsgDispatcher(_sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/): MsgDispatcher {
  const dp = MsgDispatcher.new(_sthis /*, gestalt, ende, wsRoom*/);
  dp.registerMsg(
    {
      match: MsgIsReqGestalt,
      isNotConn: true,
      fn: (ctx, msg: ReqGestalt) => {
        const resGestalt = buildResGestalt(msg, ctx.gestalt, msg.auth);
        // console.log(">>>>>>>>>>>>>>", resGestalt);
        return resGestalt;
      },
    },
    {
      match: MsgIsReqOpen,
      isNotConn: true,
      fn: (ctx, msg) => {
        if (!MsgIsReqOpen(msg)) {
          return buildErrorMsg(ctx, msg, new Error("missing connection"));
        }
        if (ctx.wsRoom.isConnected(msg)) {
          return buildResOpen(ctx.sthis, msg, msg.conn.resId);
        }
        // const resId = sthis.nextId(12).str;
        const resId = ctx.ws?.id;
        const resOpen = buildResOpen(ctx.sthis, msg, resId);
        ctx.wsRoom.addConn(ctx, ctx.ws, resOpen.conn);
        return resOpen;
      },
    },
    {
      match: MsgIsReqClose,
      fn: (ctx, msg: MsgWithConn<ReqClose>) => {
        ctx.wsRoom.removeConn(msg.conn);
        return buildResClose(msg, msg.conn);
      },
    },
    {
      match: MsgIsReqChat,
      fn: (ctx, msg: MsgWithConn<ReqChat>) => {
        const connItems = ctx.wsRoom.getConns(msg.conn);
        const ci = connItems.map((i) => i.conns).flat();

        for (const item of connItems) {
          for (const conn of item.conns) {
            if (qsidEqual(conn, msg.conn)) {
              if (msg.message.startsWith("/close-connection")) {
                setTimeout(() => {
                  item.ws?.close();
                  ctx.wsRoom.removeConn(...item.conns);
                }, 50);
              }
              continue;
            }
            if (msg.message.startsWith("/ping")) {
              continue;
            }
            const resChat = buildResChat(msg, conn, `[${msg.conn.reqId}]: ${msg.message}`, ci);
            dp.send(
              {
                ...ctx,
                ws: item.ws,
              },
              resChat,
            );
          }
        }
        return buildResChat(msg, msg.conn, `ack: ${msg.message}`, ci);
      },
    },
    {
      match: MsgIsReqGetData,
      fn: ensureTendantLedger<ReqGetData>((ctx, msg) => {
        return buildResGetData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqPutData,
      fn: ensureTendantLedger<ReqPutData>((ctx, msg) => {
        return buildResPutData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqDelData,
      fn: ensureTendantLedger<ReqDelData>((ctx, msg) => {
        return buildResDelData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqGetWAL,
      fn: ensureTendantLedger<ReqGetWAL>((ctx, msg) => {
        return buildResGetWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqPutWAL,
      fn: ensureTendantLedger<ReqPutWAL>((ctx, msg) => {
        return buildResPutWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqDelWAL,
      fn: ensureTendantLedger<ReqDelWAL>((ctx, msg) => {
        return buildResDelWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsBindGetMeta,
      fn: ensureTendantLedger<BindGetMeta>((ctx, msg) => {
        return ctx.impl.handleBindGetMeta(ctx, msg);
      }),
    },
    {
      match: MsgIsReqPutMeta,
      fn: ensureTendantLedger<ReqPutMeta>(async (ctx, req) => {
        const ret = await ctx.impl.handleReqPutMeta(ctx, req);
        if (!ps.MsgIsResPutMeta(ret)) {
          return ret;
        }
        const conns = ctx.wsRoom.getConns(req.conn);
        // console.log("MsgIsReqPutMeta conns", conns.length, req.conn, conns);
        for (const conn of conns) {
          for (const rConn of conn.conns) {
            if (qsidEqual(rConn, req.conn)) {
              continue;
            }
            // pretty bad but ok for now we should be able to
            // filter by tenant and ledger on a connection level
            const res = await metaMerger(ctx).metaToSend({
              conn: rConn,
              tenant: req.tenant,
            });
            if (res.metas.length === 0) {
              // console.log("MsgIsReqPutMeta skip empty", conns.length, rConn, req.conn, conn.conns);
              continue;
            }
            // console.log("MsgIsReqPutMeta send", conns.length, rConn, req.conn, conn.conns);
            dp.send(
              {
                ...ctx,
                ws: conn.ws,
              },
              ps.buildEventGetMeta(
                ctx,
                req,
                res,
                {
                  conn: rConn,
                  tenant: req.tenant,
                },
                ret.signedUrl,
              ),
            );
          }
        }
        return ret;
      }),
    },
    {
      match: MsgIsReqDelMeta,
      fn: ensureTendantLedger<ReqDelMeta>((ctx, msg) => {
        return ctx.impl.handleReqDelMeta(ctx, msg);
      }),
    },
  );
  return dp;
}
