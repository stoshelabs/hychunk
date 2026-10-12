import type { RegionSource } from '../world/source';
import type { BsonDocument } from '../bson/reader';
import type { ChunkSurface } from '../world/chunk';

/** What a job can use: the chunk's data, read and cached on whichever thread runs it. */
export interface JobContext {
    /** The decoded chunk, or `null` when the save has none there. Damaged chunks throw `CorruptChunkError`. */
    chunk(cx: number, cz: number): Promise<BsonDocument | null>;
    /** The chunk's top-down surface, cached; `null` when missing or damaged. */
    /** `decor`: a predicted chunk with its trees, rocks and plants too (a chunk from the save is the same either way). */
    surface(cx: number, cz: number, decor?: boolean, shared?: unknown[]): Promise<ChunkSurface | null>;
    /** A neighbour for shading the edge of a chunk: the real surface when the save has the chunk, else just its predicted ground heights along the edges (cheap). */
    neighbor(cx: number, cz: number, decor?: boolean, shared?: unknown[]): Promise<ChunkSurface | null>;
    /** Values the app handed to the pool with `configure`, such as the block table and texture atlas. */
    settings: Record<string, unknown>;
    /** The generator for this world's seed, when the person's game files have been handed to the pool. */
    terrainGen(): any;
}

export interface JobResult<R> {
    result: R;
    /** Buffers to hand over instead of copying, when the job ran in a worker. */
    transfer?: Transferable[];
}

export type JobHandler<P = any, R = any> = (ctx: JobContext, params: P) => Promise<JobResult<R>>;
export type JobHandlers = Record<string, JobHandler>;

export interface Job<R> {
    promise: Promise<R>;
    /** Drops the job if it has not started; one already running finishes and its result is ignored. */
    cancel(): void;
}

export interface ChunkPool {
    /** How many jobs run at once. */
    readonly size: number;
    /** Gives every worker a value that jobs can read from `ctx.settings[key]`; jobs started after this see it. */
    configure(key: string, value: unknown): void;
    /** Lower `priority` runs first. */
    run<R>(kind: string, params: unknown, priority?: number): Job<R>;
    destroy(): void;
}

export type { RegionSource };
