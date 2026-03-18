import type { FastifyReply } from "fastify";
import { Type, type TSchema } from "@sinclair/typebox";

type ErrorStatis =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

const errorMap: Record<ErrorStatis, number> = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
};

const fastifyModularErrorSymbol = Symbol.for("FastifyModularError");

/**
 * Standardized route error that can be sent directly to the client.
 *
 * @remarks
 * Use this inside middlewares or handlers when you want a stable error shape and
 * matching status code without writing reply logic manually.
 *
 * @example
 * ```ts
 * throw new GenericRouteError(
 *   "UNAUTHORIZED",
 *   "User must be authenticated",
 * );
 * ```
 */
export class GenericRouteError<T> extends Error {
  readonly [fastifyModularErrorSymbol] = true;
  readonly code: number;
  readonly payload?: T;
  readonly status: ErrorStatis;

  /**
   * Creates a typed route error for the given status.
   */
  constructor(status: ErrorStatis, message: string, payload?: T) {
    super(message);
    this.status = status;
    this.code = errorMap[status];
    this.payload = payload;
  }

  /**
   * Wraps an existing error while preserving its stack trace.
   */
  static fromError<T>(
    error: Error,
    status: ErrorStatis,
    message: string,
    payload?: T
  ) {
    const fastifyError = new GenericRouteError(status, message, payload);

    fastifyError.stack = error.stack;

    return fastifyError;
  }

  /**
   * Serializes the error into the response shape used by TOAB.
   */
  toJSON() {
    return {
      status: this.status,
      message: this.message,
      payload: this.payload,
      internal: {
        stack: this.stack,
      },
    };
  }

  /**
   * Sends this error to the current Fastify reply.
   */
  send(reply: FastifyReply) {
    return reply.status(this.code).send(this.toJSON());
  }
}

/**
 * Checks whether an unknown error was created via {@link GenericRouteError}.
 *
 * @example
 * ```ts
 * if (isGenericError(error)) {
 *   console.error(error.status, error.payload);
 * }
 * ```
 */
export function isGenericError<T>(
  error: unknown
): error is GenericRouteError<T> {
  return (error as GenericRouteError<T>)[fastifyModularErrorSymbol] === true;
}

function createErrorResponseOpenAPI(description: string, errorCode: number) {
  return Type.Object(
    {
      status: Type.String(),
      message: Type.String(),
      payload: Type.Optional(Type.Any()),
      internal: Type.Optional(
        Type.Object({
          stack: Type.Optional(Type.String()),
          cause: Type.Optional(Type.String()),
        })
      ),
    },
    { description, $id: `ERROR_${errorCode}` }
  );
}

export const fastifyGenericErrorResponsesSchemas: Record<number, TSchema> = {
  400: createErrorResponseOpenAPI("Bad request, input malformed.", 400),
  401: createErrorResponseOpenAPI("Unauthorized", 401),
  403: createErrorResponseOpenAPI("Forbidden", 403),
  404: createErrorResponseOpenAPI("Not found", 404),
  405: createErrorResponseOpenAPI("Method not allowed", 405),
  500: createErrorResponseOpenAPI("Internal server error", 500),
};

export const fastifyGenericErrorResponsesRefs = {
  400: { $ref: "ERROR_400" },
  401: { $ref: "ERROR_401" },
  403: { $ref: "ERROR_403" },
  404: { $ref: "ERROR_404" },
  405: { $ref: "ERROR_405" },
  500: { $ref: "ERROR_500" },
};

/**
 * Converts arbitrary thrown values into the standard TOAB error response format.
 *
 * @remarks
 * This is the low-level helper used by the default route error handler.
 *
 * @example
 * ```ts
 * try {
 *   // route logic
 * } catch (error) {
 *   handleRouteError(error, reply);
 * }
 * ```
 */
export function handleRouteError(e: unknown, reply: FastifyReply) {
  if (isGenericError(e)) {
    e.send(reply);
    return;
  }
  if (e instanceof Error) {
    GenericRouteError.fromError(e, "INTERNAL_ERROR", e.message).send(reply);
    return;
  }
  new GenericRouteError("INTERNAL_ERROR", "Unknown internal error!").send(
    reply
  );
}
