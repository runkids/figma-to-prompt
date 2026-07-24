/**
 * Regression tests for buildPrompt.
 *
 * Synthetic fixtures model real-world structural complexity.
 * Key coverage: INSTANCE nodes with children (prototype, reactions,
 * variableBindings, referencedVariables, shadows, gradients inside instances),
 * deep nesting, images, fidelity risks.
 *
 * Variants: component × (compact | detailed | full)
 *           pixel-perfect × (compact | detailed | full)
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/ui/prompt';
import type { UISerializedNode } from '../src/shared/types';

// ---------------------------------------------------------------------------
// Fixture 1: Transfer panel — simple panel with gradient and instance children
// Vertical layout, gradient, INSTANCE with deep children carrying
// prototype settings, reactions, and variableBindings.
// ---------------------------------------------------------------------------
const transferPanel: UISerializedNode = {
  id: 'tp-root',
  name: 'Transfer Panel',
  type: 'FRAME',
  layout: { mode: 'vertical', width: 360, height: 520, gap: 8, x: 100, y: 50 },
  style: {
    backgroundColor: '#1A1038',
    borderRadius: 12,
    variables: { backgroundColor: 'BG/Dark-1' },
  },
  prototype: {
    overflowDirection: 'none',
    overlayPositionType: 'center',
    overlayBackground: { type: 'NONE' },
    overlayBackgroundInteraction: 'none',
  },
  children: [
    // Header row with gradient background
    {
      id: 'tp-header',
      name: 'Header',
      type: 'FRAME',
      layout: { mode: 'horizontal', width: 360, height: 56, gap: 8, sizing: { horizontal: 'fill', vertical: 'hug' } },
      style: { backgroundGradient: 'linear-gradient(#584AE8 0%, #6F2FE4 100%)' },
      prototype: {
        overflowDirection: 'none',
        overlayPositionType: 'center',
        overlayBackground: { type: 'NONE' },
        overlayBackgroundInteraction: 'none',
      },
      children: [
        {
          id: 'tp-title',
          name: 'Title',
          type: 'TEXT',
          text: 'Transfer',
          layout: { width: 200, height: 28 },
          style: {
            fontFamily: 'Noto Sans SC',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 20,
            color: '#FFFFFF',
            textStyleName: 'Body/Body3',
            variables: { color: 'Text/Text-1' },
          },
        },
      ],
    },
    // INSTANCE: Button with deep children — the key regression target.
    // In v0.2.4, simplifyNodes empties INSTANCE children, losing all of:
    //   - child prototype settings
    //   - child reactions
    //   - child variableBindings + referencedVariables
    //   - child tokens (colors, shadows, gradients)
    {
      id: 'tp-action-btn',
      name: 'Basic Button',
      type: 'INSTANCE',
      componentName: 'Button/Action',
      layout: { width: 328, height: 48 },
      style: {
        backgroundColor: '#584AE8',
        borderRadius: 8,
        variables: { backgroundColor: 'Primary/Primary-4' },
      },
      prototype: {
        overflowDirection: 'none',
        overlayPositionType: 'center',
        overlayBackground: { type: 'NONE' },
        overlayBackgroundInteraction: 'none',
      },
      children: [
        {
          id: 'tp-action-label',
          name: 'Action/Withdraw',
          type: 'FRAME',
          layout: { mode: 'horizontal', width: 120, height: 40, gap: 4 },
          style: {},
          prototype: {
            overflowDirection: 'none',
            overlayPositionType: 'center',
            overlayBackground: { type: 'NONE' },
            overlayBackgroundInteraction: 'none',
          },
          children: [
            {
              id: 'tp-action-text',
              name: 'Label',
              type: 'TEXT',
              text: 'Withdraw',
              layout: { width: 80, height: 20 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 14,
                fontWeight: 400,
                lineHeight: 20,
                color: '#FFFFFF',
                textStyleName: 'Body/Body4',
                variables: { color: 'Text/Text-1' },
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1792',
                name: 'Text/Text-1',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                  '10:1': { modeName: 'Light', value: { r: 0.07, g: 0.07, b: 0.07, a: 1 } },
                },
              }],
            },
          ],
        },
      ],
    },
    // INSTANCE: Card row with multiple children carrying variable bindings
    {
      id: 'tp-card',
      name: 'Transfer Card',
      type: 'INSTANCE',
      componentName: 'Card/Transfer',
      layout: { width: 344, height: 200 },
      style: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        variables: { backgroundColor: 'Neutral/Neutral-2' },
      },
      prototype: {
        overflowDirection: 'none',
        overlayPositionType: 'center',
        overlayBackground: { type: 'NONE' },
        overlayBackgroundInteraction: 'none',
      },
      children: [
        {
          id: 'tp-card-amount',
          name: 'Amount',
          type: 'TEXT',
          text: '1,000.00',
          layout: { width: 200, height: 24 },
          style: {
            fontFamily: 'Noto Sans SC',
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 20,
            color: '#A598C1',
            textStyleName: 'Body/Body4',
            variables: { color: 'Text/Text-4' },
          },
          variableBindings: {
            fills: [{ id: 'VariableID:10:1795', name: 'Text/Text-4' }],
          },
          referencedVariables: [{
            id: 'VariableID:10:1795',
            name: 'Text/Text-4',
            collectionId: 'VariableCollectionId:10:1779',
            collectionName: 'Theme Colors',
            resolvedType: 'COLOR',
            valuesByMode: {
              '10:0': { modeName: 'Dark', value: { r: 0.65, g: 0.59, b: 0.76, a: 1 } },
              '10:1': { modeName: 'Light', value: { r: 0.40, g: 0.40, b: 0.50, a: 1 } },
            },
          }],
        },
        {
          id: 'tp-card-status',
          name: 'Status',
          type: 'TEXT',
          text: 'Pending',
          layout: { width: 100, height: 18 },
          style: {
            fontFamily: 'Noto Sans SC',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 18,
            color: '#F9A115',
            textStyleName: 'Body/Body6',
            variables: { color: 'Functional/Orange' },
          },
          variableBindings: {
            fills: [{ id: 'VariableID:10:1801', name: 'Functional/Orange' }],
          },
          referencedVariables: [{
            id: 'VariableID:10:1801',
            name: 'Functional/Orange',
            collectionId: 'VariableCollectionId:10:1779',
            collectionName: 'Theme Colors',
            resolvedType: 'COLOR',
            valuesByMode: {
              '10:0': { modeName: 'Dark', value: { r: 0.98, g: 0.63, b: 0.08, a: 1 } },
            },
          }],
        },
        {
          id: 'tp-card-tag',
          name: 'Tag',
          type: 'INSTANCE',
          componentName: 'Tag/Status',
          layout: { width: 60, height: 24 },
          style: {
            backgroundColor: '#F9A115',
            borderRadius: 4,
          },
          prototype: {
            overflowDirection: 'none',
            overlayPositionType: 'center',
            overlayBackground: { type: 'NONE' },
            overlayBackgroundInteraction: 'none',
          },
          children: [
            {
              id: 'tp-tag-label',
              name: 'feedback_elm',
              type: 'TEXT',
              text: 'NEW',
              layout: { width: 40, height: 16 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 12,
                fontWeight: 400,
                color: '#FFFFFF',
              },
              prototype: {
                overflowDirection: 'none',
                overlayPositionType: 'center',
                overlayBackground: { type: 'NONE' },
                overlayBackgroundInteraction: 'none',
              },
            },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Fixture 2: Game page — medium complexity with images and nested instances
// Medium complexity, images, absolute positioning, INSTANCE with
// reactions and prototype inside children.
// ---------------------------------------------------------------------------
const gamePage: UISerializedNode = {
  id: 'gp-root',
  name: 'Game Page',
  type: 'FRAME',
  layout: { mode: 'vertical', width: 375, height: 812, gap: 0, x: 400, y: 0, overflow: 'hidden' },
  style: { backgroundColor: '#0A0020', variables: { backgroundColor: 'BG/BG-1' } },
  variableBindings: {
    fills: [{ id: 'VariableID:15:838', name: 'Background/BG-1' }],
  },
  referencedVariables: [{
    id: 'VariableID:15:838',
    name: 'Background/BG-1',
    collectionId: 'VariableCollectionId:10:1779',
    collectionName: 'Theme Colors',
    resolvedType: 'COLOR',
    valuesByMode: {
      '10:0': { modeName: 'Dark', value: { r: 0.01, g: 0, b: 0.08, a: 1 } },
      '10:1': { modeName: 'Light', value: { r: 0.96, g: 0.96, b: 0.98, a: 1 } },
    },
  }],
  children: [
    // Sub-header with INSTANCE containing back arrow (VECTOR child inside INSTANCE)
    {
      id: 'gp-subheader',
      name: 'Sub-Header',
      type: 'INSTANCE',
      componentName: 'Header/SubPage',
      layout: { width: 375, height: 44 },
      style: {
        backgroundColor: '#1A0840',
        variables: { backgroundColor: 'Primary/Primary-1' },
      },
      prototype: {
        overflowDirection: 'none',
        overlayPositionType: 'center',
        overlayBackground: { type: 'NONE' },
        overlayBackgroundInteraction: 'none',
      },
      children: [
        {
          id: 'gp-back-btn',
          name: 'Arrow/Back',
          type: 'INSTANCE',
          componentName: 'Icon/ArrowBack',
          layout: { width: 24, height: 24 },
          style: {},
          variableBindings: {
            fills: [{ id: 'VariableID:10:1782', name: 'Primary/Primary-3' }],
          },
          referencedVariables: [{
            id: 'VariableID:10:1782',
            name: 'Primary/Primary-3',
            collectionId: 'VariableCollectionId:10:1779',
            collectionName: 'Theme Colors',
            resolvedType: 'COLOR',
            valuesByMode: {
              '10:0': { modeName: 'Dark', value: { r: 0.86, g: 0.66, b: 1, a: 0.2 } },
            },
          }],
          reactions: [{
            trigger: { type: 'ON_CLICK' },
            actions: [{ type: 'BACK' }],
          }],
          children: [
            {
              id: 'gp-arrow-vector',
              name: 'Arrow Line',
              type: 'VECTOR',
              layout: { width: 12, height: 12 },
              vectorPaths: [{ windingRule: 'NONZERO', data: 'M 10 2 L 2 10 L 10 18' }],
              style: {
                borderColor: '#FFFFFF',
                borderWidth: 2,
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1785', name: 'Primary/Primary-6' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1785',
                name: 'Primary/Primary-6',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                },
              }],
            },
          ],
        },
        {
          id: 'gp-balance',
          name: 'Balance',
          type: 'TEXT',
          text: '100.00',
          layout: { width: 80, height: 20 },
          style: {
            fontFamily: 'Noto Sans SC',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 20,
            color: '#FFFFFF',
            textStyleName: 'Body/Body3',
            variables: { color: 'Text/Text-1' },
          },
          variableBindings: {
            fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
          },
          referencedVariables: [{
            id: 'VariableID:10:1792',
            name: 'Text/Text-1',
            collectionId: 'VariableCollectionId:10:1779',
            collectionName: 'Theme Colors',
            resolvedType: 'COLOR',
            valuesByMode: {
              '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
            },
          }],
        },
        {
          id: 'gp-refresh',
          name: 'Action/refresh',
          type: 'INSTANCE',
          componentName: 'Icon/Refresh',
          layout: { width: 20, height: 20 },
          style: {},
          reactions: [{
            trigger: { type: 'ON_CLICK' },
            actions: [{ type: 'NODE', destinationId: 'refresh-handler' }],
          }],
          children: [
            {
              id: 'gp-refresh-icon',
              name: 'Union',
              type: 'VECTOR',
              layout: { width: 16, height: 16 },
              vectorPaths: [{ windingRule: 'NONZERO', data: 'M 8 2 A 6 6 0 1 1 2 8' }],
              style: { backgroundColor: '#FFFFFF' },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1785', name: 'Primary/Primary-6' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1785',
                name: 'Primary/Primary-6',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                },
              }],
            },
          ],
        },
      ],
    },
    // Game content with image
    {
      id: 'gp-content',
      name: 'GameContent',
      type: 'FRAME',
      layout: { mode: 'vertical', width: 375, height: 700, gap: 12 },
      style: {},
      children: [
        {
          id: 'gp-banner',
          name: 'Banner',
          type: 'RECTANGLE',
          layout: { width: 375, height: 200 },
          style: {
            imageFillHash: 'game-banner-hash',
            imageFillScaleMode: 'fill',
          },
        },
        {
          id: 'gp-game-grid',
          name: 'GameGrid',
          type: 'FRAME',
          layout: { mode: 'horizontal', width: 343, height: 300, gap: 8 },
          style: {},
          children: [
            {
              id: 'gp-game-1',
              name: 'GameCard',
              type: 'INSTANCE',
              componentName: 'Card/Game',
              layout: { width: 160, height: 200 },
              style: {
                backgroundColor: '#1A0840',
                borderRadius: 8,
                borderColor: '#3A2070',
                borderWidth: 1,
              },
              variableBindings: {
                strokes: [{ id: 'VariableID:10:1797', name: 'Border/Border-1' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1797',
                name: 'Border/Border-1',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 0.46, g: 0.22, b: 0.73, a: 1 } },
                },
              }],
              children: [
                {
                  id: 'gp-game-1-thumb',
                  name: 'Thumbnail',
                  type: 'RECTANGLE',
                  layout: { width: 160, height: 120 },
                  style: {
                    imageFillHash: 'game-thumb-1',
                    imageFillScaleMode: 'crop',
                  },
                },
                {
                  id: 'gp-game-1-name',
                  name: 'GameName',
                  type: 'TEXT',
                  text: 'Lucky Draw',
                  layout: { width: 144, height: 20 },
                  style: {
                    fontFamily: 'Noto Sans SC',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#FFFFFF',
                    variables: { color: 'Text/Text-1' },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Fixture 3: Bet page — complex page with deep instances, shadows, and gradients
// Complex: deep instances, shadows, many gradients, lots of prototype settings
// and variable bindings throughout instance children, fidelity warnings.
// ---------------------------------------------------------------------------
const betPage: UISerializedNode = {
  id: 'bp-root',
  name: 'Bet Page',
  type: 'COMPONENT',
  layout: { mode: 'vertical', width: 375, height: 812, gap: 0, x: 0, y: 0 },
  style: { backgroundColor: '#0A0020', variables: { backgroundColor: 'BG/BG-1' } },
  descriptionMarkdown: '**Bet Page** main betting interface',
  componentPropertyDefinitions: {
    GameType: { type: 'VARIANT', defaultValue: 'raffle' },
  },
  variableBindings: {
    fills: [{ id: 'VariableID:15:838', name: 'Background/BG-1' }],
  },
  referencedVariables: [{
    id: 'VariableID:15:838',
    name: 'Background/BG-1',
    collectionId: 'VariableCollectionId:10:1779',
    collectionName: 'Theme Colors',
    resolvedType: 'COLOR',
    valuesByMode: {
      '10:0': { modeName: 'Dark', value: { r: 0.01, g: 0, b: 0.08, a: 1 } },
    },
  }],
  prototype: {
    overflowDirection: 'none',
    overlayPositionType: 'center',
    overlayBackground: { type: 'NONE' },
    overlayBackgroundInteraction: 'none',
  },
  children: [
    // Sub-header INSTANCE with deep prototype settings
    {
      id: 'bp-subheader',
      name: 'Sub-Header',
      type: 'INSTANCE',
      componentName: 'Header/SubPage',
      layout: { width: 375, height: 44 },
      style: { backgroundColor: '#1A0840', variables: { backgroundColor: 'Primary/Primary-1' } },
      prototype: {
        overflowDirection: 'none',
        overlayPositionType: 'center',
        overlayBackground: { type: 'NONE' },
        overlayBackgroundInteraction: 'none',
      },
      children: [
        {
          id: 'bp-back',
          name: 'Arrow/Back',
          type: 'INSTANCE',
          componentName: 'Icon/ArrowBack',
          layout: { width: 24, height: 24 },
          style: {},
          variableBindings: {
            fills: [{ id: 'VariableID:10:1782', name: 'Primary/Primary-3' }],
          },
          referencedVariables: [{
            id: 'VariableID:10:1782',
            name: 'Primary/Primary-3',
            collectionId: 'VariableCollectionId:10:1779',
            collectionName: 'Theme Colors',
            resolvedType: 'COLOR',
            valuesByMode: {
              '10:0': { modeName: 'Dark', value: { r: 0.86, g: 0.66, b: 1, a: 0.2 } },
            },
          }],
          children: [
            {
              id: 'bp-arrow-stroke',
              name: 'Arrow_line',
              type: 'VECTOR',
              layout: { width: 12, height: 12 },
              vectorPaths: [{ windingRule: 'NONZERO', data: 'M 10 2 L 2 10 L 10 18' }],
              style: { borderColor: '#FFFFFF', borderWidth: 2 },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1785', name: 'Primary/Primary-6' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1785',
                name: 'Primary/Primary-6',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                },
              }],
            },
          ],
        },
        {
          id: 'bp-balance-section',
          name: 'BalanceArea',
          type: 'FRAME',
          layout: { mode: 'horizontal', width: 200, height: 40, gap: 4 },
          style: {},
          prototype: {
            overflowDirection: 'none',
            overlayPositionType: 'center',
            overlayBackground: { type: 'NONE' },
            overlayBackgroundInteraction: 'none',
          },
          children: [
            {
              id: 'bp-balance-val',
              name: 'BalanceValue',
              type: 'TEXT',
              text: '12,000.00',
              layout: { width: 120, height: 20 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 20,
                color: '#FFFFFF',
                textStyleName: 'Body/Body3',
                variables: { color: 'Text/Text-1' },
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1792',
                name: 'Text/Text-1',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                },
              }],
            },
            {
              id: 'bp-refresh-action',
              name: 'Action/refresh',
              type: 'INSTANCE',
              componentName: 'Icon/Refresh',
              layout: { width: 20, height: 20 },
              style: {},
              reactions: [{
                trigger: { type: 'ON_CLICK' },
                actions: [{ type: 'NODE', destinationId: 'refresh-handler' }],
              }],
              children: [
                {
                  id: 'bp-refresh-union',
                  name: 'Union',
                  type: 'VECTOR',
                  layout: { width: 16, height: 16 },
                  style: { backgroundColor: '#FFFFFF' },
                  variableBindings: {
                    fills: [{ id: 'VariableID:10:1785', name: 'Primary/Primary-6' }],
                  },
                  referencedVariables: [{
                    id: 'VariableID:10:1785',
                    name: 'Primary/Primary-6',
                    collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                    resolvedType: 'COLOR',
                    valuesByMode: {
                      '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                    },
                  }],
                },
              ],
            },
          ],
        },
        {
          id: 'bp-deposit-btn',
          name: 'Basic Button',
          type: 'INSTANCE',
          componentName: 'Button/Deposit',
          layout: { width: 100, height: 36 },
          style: { backgroundColor: '#584AE8', borderRadius: 4 },
          prototype: {
            overflowDirection: 'none',
            overlayPositionType: 'center',
            overlayBackground: { type: 'NONE' },
            overlayBackgroundInteraction: 'none',
          },
          reactions: [{
            trigger: { type: 'ON_CLICK' },
            actions: [{ type: 'NODE', destinationId: 'deposit-page' }],
          }],
          children: [
            {
              id: 'bp-deposit-label',
              name: 'DepositLabel',
              type: 'TEXT',
              text: 'Deposit',
              layout: { width: 60, height: 20 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 14,
                fontWeight: 500,
                color: '#FFFFFF',
                variables: { color: 'Text/Text-1' },
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1792',
                name: 'Text/Text-1',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 1, g: 1, b: 1, a: 1 } },
                },
              }],
            },
          ],
        },
      ],
    },
    // Raffle content with draw results, shadows, and images
    {
      id: 'bp-raffle',
      name: 'RaffleArea',
      type: 'FRAME',
      layout: { mode: 'vertical', width: 375, height: 700, gap: 4, overflow: 'hidden' },
      style: {},
      children: [
        {
          id: 'bp-game-info',
          name: 'GameInfo',
          type: 'FRAME',
          layout: { mode: 'vertical', width: 343, height: 120, gap: 2 },
          style: {
            backgroundColor: '#DBA9FF',
            borderRadius: 8,
            variables: { backgroundColor: 'Primary/Primary-3' },
          },
          children: [
            {
              id: 'bp-game-title',
              name: 'GameTitle',
              type: 'TEXT',
              text: 'Lucky Draw 10',
              layout: { width: 300, height: 24 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 14,
                fontWeight: 500,
                color: '#FFFFFF',
                textStyleName: 'Body/Body3',
                variables: { color: 'Text/Text-1' },
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
              },
            },
            {
              id: 'bp-draw-number',
              name: 'DrawNumber',
              type: 'TEXT',
              text: '20190313034',
              layout: { width: 200, height: 20 },
              style: {
                fontFamily: 'Noto Sans SC',
                fontSize: 14,
                fontWeight: 400,
                lineHeight: 20,
                color: '#F9A115',
                textStyleName: 'Body/Body4',
                variables: { color: 'Functional/Orange' },
              },
              variableBindings: {
                fills: [{ id: 'VariableID:10:1801', name: 'Functional/Orange' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1801',
                name: 'Functional/Orange',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 0.98, g: 0.63, b: 0.08, a: 1 } },
                },
              }],
            },
            {
              id: 'bp-timer',
              name: 'Countdown',
              type: 'FRAME',
              layout: { mode: 'horizontal', width: 200, height: 28, gap: 2 },
              style: {},
              children: [
                {
                  id: 'bp-time-block',
                  name: 'time',
                  type: 'FRAME',
                  layout: { mode: 'none', width: 28, height: 28 },
                  style: {
                    backgroundColor: '#DBA9FF',
                    borderRadius: 4,
                    variables: { backgroundColor: 'Primary/Primary-3' },
                  },
                  variableBindings: {
                    fills: [{ id: 'VariableID:10:1782', name: 'Primary/Primary-3' }],
                  },
                  referencedVariables: [{
                    id: 'VariableID:10:1782',
                    name: 'Primary/Primary-3',
                    collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                    resolvedType: 'COLOR',
                    valuesByMode: {
                      '10:0': { modeName: 'Dark', value: { r: 0.86, g: 0.66, b: 1, a: 0.2 } },
                    },
                  }],
                  children: [
                    {
                      id: 'bp-time-val',
                      name: 'TimeValue',
                      type: 'TEXT',
                      text: '20',
                      layout: { width: 24, height: 20 },
                      style: {
                        fontFamily: 'Noto Sans SC',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#FFFFFF',
                        variables: { color: 'Text/Text-1' },
                      },
                      variableBindings: {
                        fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
                      },
                    },
                  ],
                },
                {
                  id: 'bp-time-sep',
                  name: 'Separator',
                  type: 'TEXT',
                  text: ':',
                  layout: { width: 8, height: 20 },
                  style: {
                    fontFamily: 'Noto Sans SC',
                    fontSize: 14,
                    color: '#A598C1',
                    variables: { color: 'Text/Text-4' },
                  },
                  variableBindings: {
                    fills: [{ id: 'VariableID:10:1795', name: 'Text/Text-4' }],
                  },
                  referencedVariables: [{
                    id: 'VariableID:10:1795',
                    name: 'Text/Text-4',
                    collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                    resolvedType: 'COLOR',
                    valuesByMode: {
                      '10:0': { modeName: 'Dark', value: { r: 0.65, g: 0.59, b: 0.76, a: 1 } },
                    },
                  }],
                },
              ],
            },
          ],
        },
        // Raffle balls with shadows and gradients — inside INSTANCE
        {
          id: 'bp-results',
          name: 'DrawResults',
          type: 'INSTANCE',
          componentName: 'Results/BallRow',
          layout: { mode: 'horizontal', width: 343, height: 60, gap: 4 },
          style: {},
          children: [
            {
              id: 'bp-ball-1',
              name: 'Ball',
              type: 'ELLIPSE',
              layout: { width: 32, height: 32 },
              style: {
                backgroundGradient: 'linear-gradient(#FFEB10 0%, #FFBC0D 100%)',
                shadows: [{
                  type: 'drop',
                  offsetX: 1,
                  offsetY: 1,
                  blur: 1,
                  spread: 0,
                  color: '#EFB002',
                  opacity: 0.6,
                }],
              },
            },
            {
              id: 'bp-ball-2',
              name: 'Ball',
              type: 'ELLIPSE',
              layout: { width: 32, height: 32 },
              style: {
                backgroundGradient: 'linear-gradient(#55C3FF 0%, #1291F1 100%)',
                shadows: [{
                  type: 'drop',
                  offsetX: 1,
                  offsetY: 1,
                  blur: 1,
                  spread: 0,
                  color: '#097ACD',
                  opacity: 0.6,
                }],
              },
            },
            {
              id: 'bp-ball-3',
              name: 'Ball',
              type: 'ELLIPSE',
              layout: { width: 32, height: 32 },
              style: {
                backgroundGradient: 'linear-gradient(#9573FF 0%, #6118FF 100%)',
                shadows: [{
                  type: 'drop',
                  offsetX: 1,
                  offsetY: 1,
                  blur: 1,
                  spread: 0,
                  color: '#470CC9',
                  opacity: 0.6,
                }],
              },
            },
          ],
        },
        // Bet table with border variable bindings
        {
          id: 'bp-bet-table',
          name: 'BetTable',
          type: 'FRAME',
          layout: { mode: 'vertical', width: 343, height: 400, gap: 0 },
          style: {
            backgroundColor: '#1A0840',
            borderRadius: 8,
            borderColor: '#3A2070',
            borderWidth: 1,
          },
          children: [
            {
              id: 'bp-bet-row',
              name: 'BetRow',
              type: 'INSTANCE',
              componentName: 'Row/BetOption',
              layout: { width: 343, height: 48 },
              style: {
                borderColor: '#3A2070',
                borderWidth: 1,
              },
              variableBindings: {
                strokes: [{ id: 'VariableID:10:1797', name: 'Border/Border-1' }],
              },
              referencedVariables: [{
                id: 'VariableID:10:1797',
                name: 'Border/Border-1',
                collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                resolvedType: 'COLOR',
                valuesByMode: {
                  '10:0': { modeName: 'Dark', value: { r: 0.46, g: 0.22, b: 0.73, a: 1 } },
                },
              }],
              children: [
                {
                  id: 'bp-bet-label',
                  name: 'Label',
                  type: 'TEXT',
                  text: 'Big',
                  layout: { width: 100, height: 20 },
                  style: {
                    fontFamily: 'Noto Sans SC',
                    fontSize: 14,
                    fontWeight: 400,
                    color: '#FFFFFF',
                    variables: { color: 'Text/Text-1' },
                  },
                  variableBindings: {
                    fills: [{ id: 'VariableID:10:1792', name: 'Text/Text-1' }],
                  },
                },
                {
                  id: 'bp-bet-odds',
                  name: 'Odds',
                  type: 'TEXT',
                  text: '1.98',
                  layout: { width: 60, height: 20 },
                  style: {
                    fontFamily: 'Noto Sans SC',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#F9A115',
                    variables: { color: 'Functional/Orange' },
                  },
                },
                {
                  id: 'bp-bet-tag',
                  name: 'ResultTag',
                  type: 'INSTANCE',
                  componentName: 'Tag/Result',
                  layout: { width: 40, height: 20 },
                  style: { backgroundColor: '#8E81B2', borderRadius: 4, variables: { backgroundColor: 'Primary/Primary-2' } },
                  prototype: {
                    overflowDirection: 'none',
                    overlayPositionType: 'center',
                    overlayBackground: { type: 'NONE' },
                    overlayBackgroundInteraction: 'none',
                  },
                  children: [
                    {
                      id: 'bp-tag-text',
                      name: 'text',
                      type: 'TEXT',
                      text: 'Won',
                      layout: { width: 30, height: 16 },
                      style: {
                        fontFamily: 'Noto Sans SC',
                        fontSize: 12,
                        fontWeight: 400,
                        color: '#C8BADE',
                        variables: { color: 'Text/Text-3' },
                      },
                      variableBindings: {
                        fills: [{ id: 'VariableID:10:1794', name: 'Text/Text-3' }],
                      },
                      referencedVariables: [{
                        id: 'VariableID:10:1794',
                        name: 'Text/Text-3',
                        collectionId: 'VariableCollectionId:10:1779',
                collectionName: 'Theme Colors',
                        resolvedType: 'COLOR',
                        valuesByMode: {
                          '10:0': { modeName: 'Dark', value: { r: 0.79, g: 0.72, b: 0.87, a: 1 } },
                        },
                      }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Section presence expectations per variant
// ---------------------------------------------------------------------------
interface SectionExpectation {
  present: string[];
  absent: string[];
}

const COMPONENT_SECTIONS: Record<string, SectionExpectation> = {
  compact: {
    present: [
      '# Component:',
      '## Guidelines',
      '## Design Tokens',
      '## Component Structure',
    ],
    absent: [
      '# Pixel-perfect',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Tree Outline',
      '## Pixel Perfect Template',
    ],
  },
  detailed: {
    present: [
      '# Component:',
      '## Guidelines',
      '## Design Tokens',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Component Structure',
    ],
    absent: [
      '# Pixel-perfect',
      '## Tree Outline',
      '## Pixel Perfect Template',
    ],
  },
  full: {
    present: [
      '# Component:',
      '## Guidelines',
      '## Design Tokens',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Tree Outline',
      '## Component Structure',
    ],
    absent: [
      '# Pixel-perfect',
      '## Pixel Perfect Template',
    ],
  },
};

const PIXEL_SECTIONS: Record<string, SectionExpectation> = {
  compact: {
    present: [
      '# Pixel-perfect Figma rebuild:',
      '## Guidelines',
      '## Design Tokens',
      '## Pixel Perfect Template',
      '## Component Structure',
    ],
    absent: [
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Tree Outline',
    ],
  },
  detailed: {
    present: [
      '# Pixel-perfect Figma rebuild:',
      '## Guidelines',
      '## Design Tokens',
      '## Pixel Perfect Template',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Component Structure',
    ],
    absent: [
      '## Tree Outline',
    ],
  },
  full: {
    present: [
      '# Pixel-perfect Figma rebuild:',
      '## Guidelines',
      '## Design Tokens',
      '## Pixel Perfect Template',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Tree Outline',
      '## Component Structure',
    ],
    absent: [],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
type PromptDetail = 'compact' | 'detailed' | 'full';
type PromptTemplate = 'component' | 'pixel-perfect';

const DETAILS: PromptDetail[] = ['compact', 'detailed', 'full'];
const FIXTURES = [
  { name: 'transferPanel', node: transferPanel },
  { name: 'gamePage', node: gamePage },
  { name: 'betPage', node: betPage },
] as const;

describe('prompt regression: section presence', () => {
  for (const { name, node } of FIXTURES) {
    describe(name, () => {
      for (const detail of DETAILS) {
        it(`component/${detail} has correct sections`, () => {
          const prompt = buildPrompt(node, { promptDetail: detail });
          const exp = COMPONENT_SECTIONS[detail];
          for (const s of exp.present) expect(prompt).toContain(s);
          for (const s of exp.absent) expect(prompt).not.toContain(s);
        });

        it(`pixel-perfect/${detail} has correct sections`, () => {
          const prompt = buildPrompt(node, { promptTemplate: 'pixel-perfect', promptDetail: detail });
          const exp = PIXEL_SECTIONS[detail];
          for (const s of exp.present) expect(prompt).toContain(s);
          for (const s of exp.absent) expect(prompt).not.toContain(s);
        });
      }
    });
  }
});

describe('prompt regression: guideline content', () => {
  it('component template includes 99% fidelity', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('99% fidelity');
    expect(prompt).not.toContain('pixel-perfect visual fidelity');
  });

  it('pixel-perfect template includes pixel-perfect fidelity', () => {
    const prompt = buildPrompt(transferPanel, { promptTemplate: 'pixel-perfect' });
    expect(prompt).toContain('pixel-perfect visual fidelity');
  });

  for (const template of ['component', 'pixel-perfect'] as PromptTemplate[]) {
    it(`${template} guidelines include all required rules`, () => {
      const prompt = buildPrompt(transferPanel, { promptTemplate: template });
      const requiredGuidelines = [
        'semantic HTML',
        'layout.mode',
        'layout.sizing',
        'layout.layoutPositioning',
        'box-sizing: border-box',
        'style.variables',
        'INSTANCE nodes',
        'paint order',
        'style.fills',
        'textStyleRanges',
        'reactions',
        'prototype',
        'componentPropertyDefinitions',
        'annotations',
      ];
      for (const g of requiredGuidelines) {
        expect(prompt).toContain(g);
      }
    });
  }
});

describe('prompt regression: design tokens', () => {
  it('transferPanel collects gradient from header', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('### Gradients');
    expect(prompt).toContain('linear-gradient(#584AE8 0%, #6F2FE4 100%)');
  });

  it('transferPanel collects variables as CSS custom properties', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('var(--BG-Dark-1)');
    expect(prompt).toContain('var(--Text-Text-1)');
    expect(prompt).toContain('var(--Primary-Primary-4)');
  });

  it('transferPanel collects typography with style names from instance children', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('"Body/Body3"');
    expect(prompt).toContain('"Body/Body4"');
    expect(prompt).toContain('"Body/Body6"');
  });

  it('transferPanel collects spacing and radii', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('### Spacing & Radii');
  });

  it('transferPanel collects colors from deep INSTANCE children', () => {
    const prompt = buildPrompt(transferPanel);
    // Colors from INSTANCE > child text nodes
    expect(prompt).toContain('var(--Text-Text-4)');
    expect(prompt).toContain('var(--Functional-Orange)');
    expect(prompt).toContain('var(--Neutral-Neutral-2)');
  });

  it('betPage collects shadows from INSTANCE children (raffle balls)', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('### Shadows');
    expect(prompt).toContain('#EFB002');
    expect(prompt).toContain('#097ACD');
    expect(prompt).toContain('#470CC9');
  });

  it('betPage collects gradients from INSTANCE children (raffle balls)', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('linear-gradient(#FFEB10 0%, #FFBC0D 100%)');
    expect(prompt).toContain('linear-gradient(#55C3FF 0%, #1291F1 100%)');
    expect(prompt).toContain('linear-gradient(#9573FF 0%, #6118FF 100%)');
  });
});

describe('prompt regression: component dependencies', () => {
  it('transferPanel lists all instance component names sorted', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('## Component Dependencies');
    expect(prompt).toContain('`Button/Action`');
    expect(prompt).toContain('`Card/Transfer`');
    expect(prompt).toContain('`Tag/Status`');
  });

  it('betPage lists all instance component names', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('`Button/Deposit`');
    expect(prompt).toContain('`Header/SubPage`');
    expect(prompt).toContain('`Icon/ArrowBack`');
    expect(prompt).toContain('`Icon/Refresh`');
    expect(prompt).toContain('`Results/BallRow`');
    expect(prompt).toContain('`Row/BetOption`');
    expect(prompt).toContain('`Tag/Result`');
  });

  it('gamePage lists deeply nested INSTANCE component names', () => {
    const prompt = buildPrompt(gamePage);
    expect(prompt).toContain('`Header/SubPage`');
    expect(prompt).toContain('`Icon/ArrowBack`');
    expect(prompt).toContain('`Icon/Refresh`');
    expect(prompt).toContain('`Card/Game`');
  });
});

describe('prompt regression: interaction contract', () => {
  it('transferPanel includes prototype settings from root and children', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).toContain('## Interaction Contract');
    expect(prompt).toContain('prototype settings');
    expect(prompt).toContain('overflowDirection');
  });

  it('transferPanel counts correct number of prototype entries', () => {
    const prompt = buildPrompt(transferPanel);
    const protoCount = (prompt.match(/prototype settings/g) || []).length;
    // root + header + action-btn + action-label + card + card-tag + tag-label = 7
    expect(protoCount).toBeGreaterThanOrEqual(7);
  });

  it('gamePage includes reactions from INSTANCE children (back button, refresh)', () => {
    const prompt = buildPrompt(gamePage);
    expect(prompt).toContain('## Interaction Contract');
    expect(prompt).toContain('ON_CLICK');
    expect(prompt).toContain('BACK');
    expect(prompt).toContain('refresh-handler');
  });

  it('betPage includes reactions from deeply nested INSTANCE children', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('deposit-page');
    expect(prompt).toContain('refresh-handler');
  });

  it('betPage includes prototype settings from deep instance tree', () => {
    const prompt = buildPrompt(betPage);
    const protoCount = (prompt.match(/prototype settings/g) || []).length;
    // root + subheader + balance-section + deposit-btn + bet-tag = 5+
    expect(protoCount).toBeGreaterThanOrEqual(5);
  });
});

describe('prompt regression: component API contract', () => {
  it('betPage includes component API section with property definitions', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('## Component API Contract');
    expect(prompt).toContain('**Bet Page** main betting interface');
    expect(prompt).toContain('"GameType"');
  });

  it('betPage includes variableBindings from root', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('Variable bindings');
    expect(prompt).toContain('Background/BG-1');
  });

  it('betPage includes referencedVariables catalog from root', () => {
    const prompt = buildPrompt(betPage);
    expect(prompt).toContain('Referenced variable catalog');
    expect(prompt).toContain('Background/BG-1');
    expect(prompt).toContain('Theme Colors');
  });

  it('gamePage includes variableBindings and referencedVariables from root', () => {
    const prompt = buildPrompt(gamePage);
    expect(prompt).toContain('## Component API Contract');
    expect(prompt).toContain('Background/BG-1');
    expect(prompt).toContain('Referenced variable catalog');
  });

  it('betPage includes variableBindings from deep INSTANCE children', () => {
    const prompt = buildPrompt(betPage);
    // variableBindings inside instance children (e.g., Arrow/Back, BalanceValue, etc.)
    expect(prompt).toContain('Primary/Primary-3');
    expect(prompt).toContain('Primary/Primary-6');
    expect(prompt).toContain('Text/Text-1');
    expect(prompt).toContain('Text/Text-3');
    expect(prompt).toContain('Text/Text-4');
    expect(prompt).toContain('Functional/Orange');
    expect(prompt).toContain('Border/Border-1');
  });

  it('betPage includes referencedVariables with multi-mode values from children', () => {
    const prompt = buildPrompt(betPage);
    // Mode values from deeply nested referencedVariables
    expect(prompt).toContain('modeName');
    expect(prompt).toContain('Dark');
  });

  it('gamePage includes variableBindings from nested INSTANCE > INSTANCE > VECTOR', () => {
    const prompt = buildPrompt(gamePage);
    // Arrow/Back > Arrow Line vector has variableBindings
    expect(prompt).toContain('Primary/Primary-6');
    // Refresh > Union vector has variableBindings
    expect(prompt).toContain('Primary/Primary-6');
  });
});

describe('prompt regression: fidelity risk summary', () => {
  it('betPage raffle area triggers overflow fidelity risk (detailed+)', () => {
    const prompt = buildPrompt(betPage, { promptDetail: 'detailed' });
    // RaffleArea has overflow: 'hidden'
    expect(prompt).toContain('## Fidelity Risk Summary');
  });

  it('compact omits fidelity risk summary', () => {
    const prompt = buildPrompt(betPage, { promptDetail: 'compact' });
    expect(prompt).not.toContain('## Fidelity Risk Summary');
  });
});

describe('prompt regression: geometry checklist', () => {
  it('normalizes root x/y to 0,0', () => {
    const prompt = buildPrompt(transferPanel, { promptDetail: 'detailed' });
    expect(prompt).toContain('## Geometry Checklist');
    expect(prompt).toContain('left 0, top 0');
  });
});

describe('prompt regression: image assets', () => {
  it('gamePage lists banner and game thumbnail images', () => {
    const prompt = buildPrompt(gamePage);
    expect(prompt).toContain('## Assets');
    expect(prompt).toContain('Banner');
    expect(prompt).toContain('Thumbnail');
  });

  it('gamePage includes crop metadata for game thumbnails', () => {
    const prompt = buildPrompt(gamePage);
    expect(prompt).toContain('crop');
  });

  it('transferPanel omits assets section (no images)', () => {
    const prompt = buildPrompt(transferPanel);
    expect(prompt).not.toContain('## Assets');
  });

  it('merged mode shows composite only', () => {
    const prompt = buildPrompt(gamePage, {
      merged: { name: 'game_page', width: 375, height: 812 },
    });
    expect(prompt).toContain('`game_page.png`');
    expect(prompt).toContain('Do NOT reference any individual image files');
  });

  it('mock image paths are preserved', () => {
    const prompt = buildPrompt(gamePage, {
      mockImagePaths: { 'gp-banner': '/assets/banner.png' },
    });
    expect(prompt).toContain('mock image `/assets/banner.png`');
    expect(prompt).toContain('Do not invent, replace, or regenerate');
  });
});

describe('prompt regression: component structure JSON', () => {
  for (const { name, node } of FIXTURES) {
    it(`${name} includes valid single-line JSON in Component Structure`, () => {
      const prompt = buildPrompt(node);
      const match = prompt.match(/## Component Structure\n```\n(.+)\n```/);
      expect(match).toBeTruthy();
      const parsed = JSON.parse(match![1]);
      expect(parsed.name).toBe(node.name);
      expect(parsed.type).toBe(node.type);
    });
  }
});

describe('prompt regression: tree outline (full only)', () => {
  for (const { name, node } of FIXTURES) {
    it(`${name} full includes tree outline`, () => {
      const prompt = buildPrompt(node, { promptDetail: 'full' });
      expect(prompt).toContain('## Tree Outline');
      expect(prompt).toContain(node.name);
    });

    it(`${name} detailed omits tree outline`, () => {
      const prompt = buildPrompt(node, { promptDetail: 'detailed' });
      expect(prompt).not.toContain('## Tree Outline');
    });
  }
});

describe('prompt regression: pixel-perfect template section', () => {
  it('pixel-perfect detailed includes verification template', () => {
    const prompt = buildPrompt(transferPanel, { promptTemplate: 'pixel-perfect', promptDetail: 'detailed' });
    expect(prompt).toContain('## Pixel Perfect Template');
    expect(prompt).toContain('Capture a lossless PNG screenshot');
  });

  it('pixel-perfect compact still includes pixel perfect template', () => {
    const prompt = buildPrompt(transferPanel, { promptTemplate: 'pixel-perfect', promptDetail: 'compact' });
    expect(prompt).toContain('## Pixel Perfect Template');
  });
});

describe('prompt regression: section ordering', () => {
  it('sections appear in canonical order for component/full', () => {
    const prompt = buildPrompt(betPage, { promptDetail: 'full' });
    const sectionOrder = [
      '# Component:',
      '## Guidelines',
      '## Design Tokens',
      '## Component Dependencies',
      '## Interaction Contract',
      '## Component API Contract',
      '## Fidelity',
      '## Geometry Checklist',
      '## Implementation Checks',
      '## Tree Outline',
      '## Component Structure',
    ];

    let lastIndex = -1;
    for (const section of sectionOrder) {
      const idx = prompt.indexOf(section);
      if (idx !== -1) {
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    }
  });

  it('sections appear in canonical order for pixel-perfect/full', () => {
    const prompt = buildPrompt(betPage, { promptTemplate: 'pixel-perfect', promptDetail: 'full' });
    const sectionOrder = [
      '# Pixel-perfect Figma rebuild:',
      '## Guidelines',
      '## Design Tokens',
      '## Component Dependencies',
      '## Interaction Contract',
      '## Component API Contract',
      '## Fidelity',
      '## Geometry Checklist',
      '## Pixel Perfect Template',
      '## Implementation Checks',
      '## Tree Outline',
      '## Component Structure',
    ];

    let lastIndex = -1;
    for (const section of sectionOrder) {
      const idx = prompt.indexOf(section);
      if (idx !== -1) {
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    }
  });
});

describe('prompt regression: promptSections toggle', () => {
  it('can disable interaction contract', () => {
    const prompt = buildPrompt(betPage, { promptSections: { interactionContract: false } });
    expect(prompt).not.toContain('## Interaction Contract');
  });

  it('can disable component API', () => {
    const prompt = buildPrompt(betPage, { promptSections: { componentApi: false } });
    expect(prompt).not.toContain('## Component API Contract');
  });
});
