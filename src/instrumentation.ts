import type { FastifyInstance } from "fastify";
import type { Registries } from "./config.js";

export type InstrumentationInput = { fastify: FastifyInstance, registries: Registries };