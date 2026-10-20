import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: '@rbxts/jev',
  tagline: 'Typed decisions for Roblox games, powered by TypeSafe Jev.',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://lypt1x.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/rbxts-jev/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Lypt1x', // Usually your GitHub org/user name.
  projectName: 'rbxts-jev', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../src/index.ts'],
        tsconfig: '../tsconfig.typedoc.json',
        out: 'docs/api',
        excludeExternals: true,
        skipErrorChecking: true,
        readme: 'none',
        entryFileName: 'index',
        gitRevision: 'main',
        sidebar: {autoConfiguration: true, typescript: true},
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/Lypt1x/rbxts-jev/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: '@rbxts/jev',
      items: [
        {type: 'docSidebar', sidebarId: 'guideSidebar', position: 'left', label: 'Guide'},
        {type: 'docSidebar', sidebarId: 'apiSidebar', position: 'left', label: 'API'},
        {href: 'https://github.com/Lypt1x/rbxts-jev', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting started', to: '/getting-started/installation'},
            {label: 'API', to: '/api'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/Lypt1x/rbxts-jev'},
            {label: 'TypeSafe docs', href: 'https://docs.typesafe.ai'},
            {label: 'roblox-ts', href: 'https://roblox-ts.com'},
          ],
        },
      ],
      copyright: `MIT licensed. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['lua', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
