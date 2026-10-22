/** The text of the legal pages. English is the key of every string, like everywhere else (see i18n.ts). */
export interface LegalSection {
    heading: string;
    paragraphs: string[];
}

export interface LegalDocument {
    title: string;
    intro: string;
    sections: LegalSection[];
}

export const CONTACT_URL = 'https://github.com/stoshelabs';
export const UPDATED = '2026-10-12';

export const legal: Record<'terms' | 'privacy' | 'about', LegalDocument> = {
    about: {
        title: 'About HyChunk',
        intro: 'HyChunk is a free and open-source map of Hytale worlds that runs in your browser.',
        sections: [
            {
                heading: 'Not an official product',
                paragraphs: [
                    'HyChunk is an independent community project. It is not an official Hytale product, and it has no connection to, and is not affiliated with, sponsored by or endorsed by Hypixel Studios.',
                    'Hytale and its names, logos and game content are the property of their owners. They are mentioned here only to say what the tool is for.'
                ]
            },
            {
                heading: 'Who makes it',
                paragraphs: [
                    'HyChunk is made by Stoshe Labs and released as free software under the LGPL-3.0-or-later. It has no ads and no paid features.'
                ]
            },
            {
                heading: 'Game data',
                paragraphs: [
                    'The terrain, structures and spawns on the map are worked out by software that follows the way the game generates its worlds. They are a prediction and may differ from what the game really generates, especially after a game update.',
                    'The site includes data derived from the game files to do this, versioned per game version. It does not include textures, models or sounds. If the owners of the game ask for this data to be changed or removed, it will be.'
                ]
            }
        ]
    },
    terms: {
        title: 'Terms of Use',
        intro: 'These terms apply when you use the HyChunk website. By using it, you agree to them.',
        sections: [
            {
                heading: 'The service',
                paragraphs: [
                    'HyChunk shows maps of Hytale worlds, either from a save you open or from a seed you enter. It is free, non-commercial and offered as it is.',
                    'It is an unofficial community project, not affiliated with or endorsed by Hypixel Studios.'
                ]
            },
            {
                heading: 'Your files',
                paragraphs: [
                    'You may open only worlds that you own or have the right to open. Your files are read in your browser and are never uploaded.',
                    'You are responsible for your saves. HyChunk only reads them and never changes them, but keep your own backups.'
                ]
            },
            {
                heading: 'Predictions and accuracy',
                paragraphs: [
                    'Areas you have not explored are a prediction. They can be wrong, incomplete or out of date after a game update. Do not rely on them for anything important.',
                    'The map can reveal where things are in a world. Respect the rules of the servers you play on: do not use it where a server forbids it.'
                ]
            },
            {
                heading: 'Acceptable use',
                paragraphs: [
                    'Do not use the site to break the law, to harm others, or to overload or attack it. Do not present it as an official product of Hytale or Hypixel Studios.'
                ]
            },
            {
                heading: 'Software licence',
                paragraphs: [
                    'The source code of HyChunk is free software under the LGPL-3.0-or-later. These terms are about the use of the website; the licence governs the code.',
                    'Hytale content is not covered by that licence and remains the property of its owners.'
                ]
            },
            {
                heading: 'No warranty and liability',
                paragraphs: [
                    'The site is provided "as is", without warranties of any kind. To the extent the law allows, its makers are not liable for any loss or damage that comes from using it, including lost or damaged saves and wrong predictions.'
                ]
            },
            {
                heading: 'Changes',
                paragraphs: [
                    'These terms may change. The date at the top of the page says when they were last updated, and using the site after a change means you accept the new terms.'
                ]
            },
            {
                heading: 'Contact',
                paragraphs: ['Questions, requests and reports can be sent through the project page on GitHub.']
            }
        ]
    },
    privacy: {
        title: 'Privacy Policy',
        intro: 'HyChunk is built so that your data stays on your device. This page says what the site does and does not do with it.',
        sections: [
            {
                heading: 'What we do not collect',
                paragraphs: [
                    'We do not collect personal data. There are no accounts, no ads, no analytics and no tracking cookies.',
                    'The world folders you open are read in your browser and are never uploaded. Nothing about your worlds, players, seeds or locations is sent to us.'
                ]
            },
            {
                heading: 'What is stored on your device',
                paragraphs: [
                    'To work faster and to remember your choices, the site keeps some data in your browser: drawn map tiles and computed structures (in IndexedDB), and your preferences such as the game version, the places you marked as done and whether to hide them (in local storage).',
                    'This data never leaves your device. You can clear it from the Map tab or in your browser settings, and the site works again without it.'
                ]
            },
            {
                heading: 'What the server sees',
                paragraphs: [
                    'The site is a set of static files. When you open it, your browser asks the host for those files (the page, the game data of the selected version, images), so the host can see your IP address and browser information in its ordinary logs, as with any website. HyChunk itself does not read or keep them.',
                    'The site is hosted by a third party (GitHub Pages), whose own privacy policy applies to those logs.'
                ]
            },
            {
                heading: 'Links and sharing',
                paragraphs: [
                    'A link to a seed or a view contains only the seed, the game version and the position on the map. It is created on your device and is shared only if you copy and send it yourself.'
                ]
            },
            {
                heading: 'Children',
                paragraphs: ['The site does not ask for personal data from anyone, so it collects none from children.']
            },
            {
                heading: 'Changes and contact',
                paragraphs: [
                    'If this policy changes, the date at the top of the page will change. For questions about privacy, use the project page on GitHub.'
                ]
            }
        ]
    }
};
