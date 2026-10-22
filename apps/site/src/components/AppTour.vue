<script setup lang="ts">
import { computed, watch } from 'vue';
import { Tour, useLocale, type TourStep } from '@vitral/vue';
import { useLayout, type SidebarTab } from '../composables/useLayout';
import { useSession } from '../composables/useSession';
import { useTour } from '../composables/useTour';
import { t } from '../lib/i18n';

const tour = useTour();
const vitral = useLocale();
const layout = useLayout();
const session = useSession();

// the popover's own labels (the close button, the step name read to screen readers) come from Vitral's locale
watch(
    () => t('Close'),
    (close) => {
        const base = vitral.locale.value;
        vitral.setLocale({
            ...base,
            tour: { ...base.tour, close, next: t('Next'), previous: t('Back'), done: t('Done') }
        });
    },
    { immediate: true }
);

const hasWorld = () => !!session.world.value;
const noWorld = () => !session.world.value;
const tab = (which: SidebarTab) => () => layout.showTab(which);
const mapOnly = () => layout.closeOnMobile();
const wait = () => new Promise((resolve) => setTimeout(resolve, 60));

/** A step inside a sidebar tab: the tab is brought up first, and given a moment to show. */
function inTab(
    which: SidebarTab,
    element: string,
    title: string,
    description: string,
    side: 'top' | 'right' | 'bottom' | 'left' = 'right',
    show: () => boolean = hasWorld
): TourStep {
    return {
        element,
        when: show,
        beforeShow: async () => {
            layout.showTab(which);
            await wait();
        },
        popover: { title: t(title), description: t(description), side }
    };
}

const steps = computed<TourStep[]>(() => {
    // read so the texts follow the language
    t('Next');
    return [
        {
            popover: {
                title: t('Welcome to HyChunk'),
                description: t(
                    'A quick tour of the tools. You can close it at any time and open it again with the question mark in the top bar.'
                )
            }
        },
        {
            element: '[data-tour="start"]',
            when: noWorld,
            popover: {
                title: t('Open a world'),
                description: t(
                    'Open a server save (your files stay on your device) or enter a seed to see its predicted map. The dice picks a random seed.'
                ),
                side: 'top'
            }
        },
        {
            element: '[data-tour="version"]',
            popover: {
                title: t('Game version'),
                description: t(
                    'The map data follows a version of the game. Pick the one your world was made with, because generation changes between updates.'
                ),
                side: 'bottom',
                align: 'end'
            }
        },
        {
            element: '[data-tour="language"]',
            popover: {
                title: t('Language'),
                description: t(
                    'Change the language of the site. The address changes with it, so you can share a link in your language.'
                ),
                side: 'bottom',
                align: 'end'
            }
        },

        // Places
        inTab(
            'places',
            '[data-tour="tab-places"]',
            'Places',
            'Everything the map found: structures, dungeons, temples, portals and camps. The next steps show the parts of this tab.'
        ),
        inTab('places', '[data-tour="places-search"]', 'Search', 'Type a name or a kind of place to narrow the list.'),
        inTab(
            'places',
            '[data-tour="places-filters"]',
            'Categories',
            'Turn a category on or off. The number is how many places it has, and the same icons are drawn on the map.'
        ),
        inTab(
            'places',
            '[data-tour="places-bar"]',
            'All, none, done and CSV',
            'Show or hide every category at once, hide the places you marked as done, or save the filtered list as a CSV file.'
        ),
        inTab(
            'places',
            '[data-tour="places-tools"]',
            'Mobs and biomes',
            'Pick a mob to see where it spawns, or a biome to highlight it on the map.'
        ),
        inTab(
            'places',
            '[data-tour="places-list"]',
            'The list',
            'Nearest first. Click a place for its details, use the target to fly there and the copy button for a /tp command.',
            'right'
        ),

        // Map
        inTab(
            'map',
            '[data-tour="tab-map"]',
            'Map',
            'Settings of the map itself. The next steps show the parts of this tab.'
        ),
        inTab(
            'map',
            '[data-tour="map-seed"]',
            'World seed',
            'Change the seed to generate another world. The dice picks a random one.'
        ),
        inTab(
            'map',
            '[data-tour="map-terrain"]',
            'Terrain relief',
            'Shade the hills by the sun, like the game map, or use flat colors, which is faster for browsing.'
        ),
        inTab('map', '[data-tour="map-goto"]', 'Go to coordinates', 'Type X and Z to move the map there.'),
        inTab(
            'map',
            '[data-tour="map-layers"]',
            'Map layers',
            'Show or hide the chunk and region grids, the spawn, the markers and the players.'
        ),
        inTab(
            'map',
            '[data-tour="map-about"]',
            'About this world',
            'The name, seed, generator and spawn of the world, and a button to clear the cache stored in your browser.'
        ),

        // World
        inTab(
            'world',
            '[data-tour="tab-world"]',
            'World',
            'The world you are looking at, and the ways to open another one.'
        ),
        inTab(
            'world',
            '[data-tour="world-current"]',
            'Current world',
            'Its name and seed, or how many regions a saved world has.'
        ),
        inTab(
            'world',
            '[data-tour="world-buttons"]',
            'Open or create',
            'Open a saved world from a folder, or start a new map from a random seed.'
        ),
        inTab(
            'world',
            '[data-tour="world-list"]',
            'Worlds in the folder',
            'When the folder you opened has more than one world, switch between them here.',
            'right',
            () => hasWorld() && session.worlds.value.length > 0
        ),

        // Legal
        inTab(
            'legal',
            '[data-tour="tab-legal"]',
            'Legal',
            'The about page, the terms of use and the privacy policy, and the notice that HyChunk is not an official Hytale product.'
        ),

        {
            element: '[data-tour="map"]',
            when: hasWorld,
            beforeShow: mapOnly,
            popover: {
                title: t('The map'),
                description: t(
                    'Drag to move and scroll to zoom. Right-click anywhere for coordinates, a teleport command, a link to that spot and the mobs that spawn there.'
                ),
                side: 'left',
                align: 'center'
            }
        },
        {
            element: '[data-tour="controls"]',
            when: hasWorld,
            popover: {
                title: t('Map controls'),
                description: t(
                    'Zoom, go to the spawn, fit the explored area, and measure the distance between two points.'
                ),
                side: 'left'
            }
        },
        {
            element: '[data-tour="notice"]',
            when: hasWorld,
            popover: {
                title: t('Unofficial project'),
                description: t(
                    'HyChunk is not a Hytale product. The about page, the terms and the privacy policy are linked here.'
                ),
                side: 'top',
                align: 'end'
            }
        },
        {
            element: '[data-tour="tour"]',
            popover: {
                title: t('That is it'),
                description: t('Open this tour again at any time from this button.'),
                side: 'bottom',
                align: 'end'
            }
        }
    ];
});

/** However the tour ends, the sidebar goes back to the first tab (without opening it on a phone). */
function onEnd() {
    layout.tab.value = 'places';
}
</script>

<template>
    <Tour
        v-model:open="tour.open.value"
        :steps="steps"
        showProgress
        arrow
        allowClose
        :nextBtnText="t('Next')"
        :prevBtnText="t('Back')"
        :doneBtnText="t('Done')"
        :progressText="t('{current} of {total}')"
        @end="onEnd"
    />
</template>
