import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import typedocSidebar from './docs/api/typedoc-sidebar';

const sidebars: SidebarsConfig = {
  guideSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: [
        'index',
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/shared-setup',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/how-it-works',
        'concepts/questions-and-answers',
        'concepts/decisions',
        'concepts/async-model',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/delegate-a-decision',
        'guides/handle-errors',
        'guides/ask-from-clients',
        'guides/test-your-code',
      ],
    },
  ],
  apiSidebar: [
    {
      type: 'category',
      label: 'API reference',
      link: {type: 'doc', id: 'api/index'},
      items: typedocSidebar.items,
    },
  ],
};

export default sidebars;
