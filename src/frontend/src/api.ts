import { Principal } from "@icp-sdk/core/principal";
import {
    HttpAgent,
    HttpAgentOptions,
    Identity,
    polling,
} from "@icp-sdk/core/agent";
import { IDL, JsonValue } from "@icp-sdk/core/candid";
import { CANISTER_ID } from "./env";
import { PostId, PostMeta, Post } from "./types";

export type Backend = {
    query: <T>(methodName: string, ...args: unknown[]) => Promise<T | null>;
    call: <T>(methodName: string, ...args: unknown[]) => Promise<T | null>;
    add_post: (
        text: string,
        refs: [string, number, number][],
        parent: number[],
        space: string[],
        extension: Uint8Array[],
    ) => Promise<{ Ok?: PostId; Err?: string } | null>;
    edit_post: (
        id: number,
        text: string,
        refs: [string, number, number][],
        patch: string,
        space: string[],
    ) => Promise<{ Ok?: null; Err?: string } | null>;
    upload_media: (
        blob: Uint8Array,
    ) => Promise<{ Ok?: [string, bigint, bigint]; Err?: string } | null>;
};

export function expandMeta([post, meta]: [Post, PostMeta]): Post {
    return { ...post, meta };
}

export const ApiGenerator = (
    mainnetMode: boolean,
    identity?: Identity,
): Backend => {
    const canisterIdText = CANISTER_ID;
    const defaultPrincipal = canisterIdText
        ? Principal.fromText(canisterIdText)
        : Principal.anonymous();
    const options: HttpAgentOptions = { identity };
    if (mainnetMode && canisterIdText) {
        options.host = `https://${canisterIdText}.icp0.io`;
    }
    const agent = HttpAgent.createSync(options);
    if (!mainnetMode) {
        agent.fetchRootKey().catch((err) => {
            console.warn(
                "Unable to fetch root key. Ensure the local IC network is running.",
                err,
            );
        });
    }

    const query_raw = async (
        methodName: string,
        arg: Uint8Array = new Uint8Array(0),
    ): Promise<Uint8Array | null> => {
        if (!canisterIdText) return null;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await agent.query(canisterIdText, {
                    methodName,
                    arg,
                });
                if (response.status !== "replied") {
                    console.error(`Query ${methodName} failed:`, response);
                    return null;
                }
                return response.reply.arg;
            } catch (error) {
                console.error(`Query ${methodName} attempt ${attempt}:`, error);
                if (attempt === maxAttempts) return null;
            }
        }
        return null;
    };

    const call_raw = async (
        methodName: string,
        arg: Uint8Array = new Uint8Array(0),
    ): Promise<Uint8Array | null> => {
        if (!canisterIdText) return null;
        const { requestId, response } = await agent.call(defaultPrincipal, {
            methodName,
            arg,
        });
        if (!response.ok) {
            console.error(`Call ${methodName} rejected:`, response);
            return null;
        }
        const pollResponse = await polling.pollForResponse(
            agent,
            { canisterId: defaultPrincipal },
            requestId,
        );
        return pollResponse.reply;
    };

    const query = async <T>(
        methodName: string,
        ...args: unknown[]
    ): Promise<T | null> => {
        const arg =
            args.length === 0
                ? new Uint8Array(0)
                : new TextEncoder().encode(
                      JSON.stringify(args.length === 1 ? args[0] : args),
                  );
        const reply = await query_raw(methodName, arg);
        if (!reply || reply.length === 0) return null;
        return JSON.parse(new TextDecoder().decode(reply)) as T;
    };

    const call = async <T>(
        methodName: string,
        ...args: unknown[]
    ): Promise<T | null> => {
        const arg =
            args.length === 0
                ? new Uint8Array(0)
                : new TextEncoder().encode(
                      JSON.stringify(args.length === 1 ? args[0] : args),
                  );
        const reply = await call_raw(methodName, arg);
        if (!reply || reply.length === 0) return null;
        return JSON.parse(new TextDecoder().decode(reply)) as T;
    };

    const add_post = async (
        text: string,
        refs: [string, number, number][],
        parent: number[],
        space: string[],
        extension: Uint8Array[],
    ): Promise<{ Ok?: PostId; Err?: string } | null> => {
        const arg = IDL.encode(
            [
                IDL.Text,
                IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat64, IDL.Nat64)),
                IDL.Opt(IDL.Nat64),
                IDL.Opt(IDL.Text),
                IDL.Opt(IDL.Vec(IDL.Nat8)),
            ],
            [text, refs, parent, space, extension],
        );
        const reply = await call_raw("add_post", arg);
        if (!reply) return null;
        const decoded = IDL.decode(
            [IDL.Variant({ Ok: IDL.Nat64, Err: IDL.Text })],
            reply,
        )[0] as Record<string, JsonValue>;
        if ("Ok" in decoded) return { Ok: Number(decoded.Ok) };
        return { Err: String(decoded.Err) };
    };

    const edit_post = async (
        id: number,
        text: string,
        refs: [string, number, number][],
        patch: string,
        space: string[],
    ): Promise<{ Ok?: null; Err?: string } | null> => {
        const arg = IDL.encode(
            [
                IDL.Nat64,
                IDL.Text,
                IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat64, IDL.Nat64)),
                IDL.Text,
                IDL.Opt(IDL.Text),
            ],
            [id, text, refs, patch, space],
        );
        const reply = await call_raw("edit_post", arg);
        if (!reply) return null;
        const decoded = IDL.decode(
            [IDL.Variant({ Ok: IDL.Null, Err: IDL.Text })],
            reply,
        )[0] as Record<string, JsonValue>;
        if ("Ok" in decoded) return { Ok: null };
        return { Err: String(decoded.Err) };
    };

    const upload_media = async (
        blob: Uint8Array,
    ): Promise<{ Ok?: [string, bigint, bigint]; Err?: string } | null> => {
        const arg = IDL.encode([IDL.Vec(IDL.Nat8)], [blob]);
        const reply = await call_raw("upload_media", arg);
        if (!reply) return null;
        const decoded = IDL.decode(
            [
                IDL.Variant({
                    Ok: IDL.Tuple(IDL.Text, IDL.Nat64, IDL.Nat64),
                    Err: IDL.Text,
                }),
            ],
            reply,
        )[0] as Record<string, unknown>;
        if ("Ok" in decoded) {
            return { Ok: decoded.Ok as [string, bigint, bigint] };
        }
        return { Err: String(decoded.Err) };
    };

    return {
        query,
        call,
        add_post,
        edit_post,
        upload_media,
    };
};
