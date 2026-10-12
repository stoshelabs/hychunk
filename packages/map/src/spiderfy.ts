import type { MapMarker } from '@hychunk/core';
import { getClusterAccentColor, type MarkerClusterNode } from './markers';

export interface SpiderfyDroplet {
    marker: MapMarker;
    /** Screen offset from the cluster once fully open, and now. */
    targetOffsetX: number;
    targetOffsetY: number;
    currentOffsetX: number;
    currentOffsetY: number;
}

/** A cluster fanned out into its markers, mid-animation. */
export interface SpiderfyState {
    cluster: MarkerClusterNode;
    worldX: number;
    worldZ: number;
    droplets: SpiderfyDroplet[];
    startTime: number;
    duration: number;
    collapsing: boolean;
    collapseStartTime: number;
    collapseDuration: number;
    accentColor: string;
}

const OPEN_MS = 380;
const COLLAPSE_MS = 180;
/** Up to this many markers sit on a circle; more go on a spiral. */
const MAX_ON_CIRCLE = 8;

/** Fans the cluster's markers out around it, on a circle or, when there are many, a spiral. */
export function createSpiderfy(cluster: MarkerClusterNode, now: number): SpiderfyState {
    const n = cluster.markers.length;
    const droplets = cluster.markers.map((marker, i): SpiderfyDroplet => {
        let angle: number, distance: number;
        if (n <= MAX_ON_CIRCLE) {
            angle = (2 * Math.PI * i) / n - Math.PI / 2;
            distance = Math.max(52, 40 + n * 5);
        } else {
            angle = i * 0.65 - Math.PI / 2;
            distance = 42 + i * 5.2;
        }
        return {
            marker,
            targetOffsetX: Math.cos(angle) * distance,
            targetOffsetY: Math.sin(angle) * distance,
            currentOffsetX: 0,
            currentOffsetY: 0
        };
    });
    return {
        cluster,
        worldX: cluster.x,
        worldZ: cluster.z,
        droplets,
        startTime: now,
        duration: OPEN_MS,
        collapsing: false,
        collapseStartTime: 0,
        collapseDuration: COLLAPSE_MS,
        accentColor: getClusterAccentColor(cluster.markers)
    };
}

/** Whether a cluster is the one currently fanned out (and so drawn by the fan itself). */
export function isFannedOut(s: SpiderfyState | null, c: MarkerClusterNode, tolerance: number): boolean {
    return !!s && !s.collapsing && Math.hypot(c.x - s.worldX, c.z - s.worldZ) < tolerance;
}

function setOffsets(s: SpiderfyState, ease: number) {
    for (const d of s.droplets) {
        d.currentOffsetX = d.targetOffsetX * ease;
        d.currentOffsetY = d.targetOffsetY * ease;
    }
}

/**
 * Moves the droplets to where they are at `now`. `animating` needs another frame; `gone` means the collapse
 * has finished and the state should be dropped (after one last redraw).
 */
export function stepSpiderfy(s: SpiderfyState, now: number): 'animating' | 'settled' | 'gone' {
    if (!s.collapsing) {
        const p = Math.min(1, (now - s.startTime) / s.duration);
        // Elastic ease-out: the droplets overshoot a little and spring back.
        setOffsets(
            s,
            p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
        );
        return p < 1 ? 'animating' : 'settled';
    }
    const p = Math.min(1, (now - s.collapseStartTime) / s.collapseDuration);
    setOffsets(s, Math.max(0, 1 - p * p));
    return p >= 1 ? 'gone' : 'animating';
}
