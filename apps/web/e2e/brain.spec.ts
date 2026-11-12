import { expect, test, type Page } from '@playwright/test';
import {
  areas,
  emptyBrainConfig,
  evaluateMaturity,
  readinessPct,
  STAGE_MIN,
  type BrainConfig,
} from '@torio/contracts';
import { brainState, metaState, mockApi, resetScan, scanState } from './mocks';

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const summary = (page: Page) => page.getByRole('tabpanel', { name: 'Summary' });
const intelligence = (page: Page) => page.getByRole('tabpanel', { name: 'Intelligence' });

test.describe('brain (admin)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test.beforeEach(async ({ page }) => {
    resetScan();
    brainState.version = 3;
    brainState.puts.length = 0;
    brainState.config = null;
    await mockApi(page, { role: 'ADMIN' });
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle'); // hydrated: tab clicks are not lost
  });

  test('shows the compact header, the five tabs, and the Summary by default', async ({ page }) => {
    await expect(page.getByText('Your business. Your rules. Your AI.').first()).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Brain' }).getByRole('tab');
    await expect(tabs).toHaveText([
      'Summary',
      'Intelligence',
      'Knowledge',
      'Rules & Behavior',
      'Test AI',
    ]);
    await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(summary(page)).toBeVisible();
    // the header stays compact: tabs start high on the page
    expect((await page.getByRole('tablist', { name: 'Brain' }).boundingBox())!.y).toBeLessThan(170);
  });

  test('every section lives in exactly one tab and the section navigation works', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    const kn = page.getByRole('tabpanel', { name: 'Knowledge' });
    for (const h of [
      'Business Profile',
      'Products & Catalog',
      'Customer Policies',
      'Returns & Refunds',
      'Custom Fields',
      'Knowledge Base',
    ])
      await expect(kn.getByRole('heading', { name: h })).toBeAttached();
    await expect(kn.getByRole('heading', { name: 'Brand Voice' })).toHaveCount(0);
    await kn
      .getByRole('navigation', { name: 'Knowledge sections' })
      .getByRole('button', { name: 'Knowledge Base' })
      .click();
    await expect(kn.getByRole('heading', { name: 'Knowledge Base' })).toBeInViewport();
    await openTab(page, 'Rules & Behavior');
    const ru = page.getByRole('tabpanel', { name: 'Rules & Behavior' });
    for (const h of ['Brand Voice', 'Custom Instructions', 'Guardrails', 'Business Logic'])
      await expect(ru.getByRole('heading', { name: h })).toBeAttached();
    await expect(ru.getByRole('heading', { name: 'Business Profile' })).toHaveCount(0);
    await openTab(page, 'Summary');
    await expect(page.getByRole('progressbar', { name: 'Knowledge readiness' })).toBeVisible();
    await expect(page.getByText(/measures how complete your configuration is/)).toBeVisible();
  });

  test('the tab is in the URL: bookmarkable, restored on refresh, and back/forward work', async ({
    page,
  }) => {
    await openTab(page, 'Rules & Behavior');
    await expect(page).toHaveURL(/\/brain\?tab=rules$/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Rules & Behavior' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goto('/brain?tab=knowledge');
    await page.waitForLoadState('networkidle'); // let the page hydrate before clicking
    await expect(page.getByRole('tab', { name: 'Knowledge' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await openTab(page, 'Test AI');
    await expect(page).toHaveURL(/tab=test/);
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Knowledge' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goForward();
    await expect(page.getByRole('tab', { name: 'Test AI' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // an unknown tab falls back to Summary
    await page.goto('/brain?tab=nope');
    await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('unsaved edits and validation survive switching tabs; nothing is saved by switching', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('Switch Test');
    await openTab(page, 'Rules & Behavior');
    await expect(page.getByRole('button', { name: /Unsaved changes \(1\)/ })).toBeVisible();
    await page.getByLabel('Custom greeting').fill('Hello from rules');
    await openTab(page, 'Summary');
    await expect(page.getByText('Unsaved changes').first()).toBeVisible();
    await openTab(page, 'Knowledge');
    await expect(page.getByLabel('Brand name *')).toHaveValue('Switch Test');
    await openTab(page, 'Rules & Behavior');
    await expect(page.getByLabel('Custom greeting')).toHaveValue('Hello from rules');
    expect(brainState.puts).toHaveLength(0);
    // a validation problem stays visible after leaving and returning
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Business name is required' }).first(),
    ).toBeVisible();
    await openTab(page, 'Test AI');
    await openTab(page, 'Knowledge');
    await expect(page.getByLabel('Brand name *')).toHaveValue('');
    expect(brainState.puts).toHaveLength(0);
  });

  test('tracks unsaved changes, saves with the base version, and clears the indicator', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await page.getByLabel('Brand name *').fill('UrbanNest Renamed');
    await expect(page.getByRole('button', { name: /Unsaved changes \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Brain saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unsaved changes/ })).toHaveCount(0);
    expect((brainState.puts[0] as { baseVersion: number }).baseVersion).toBe(3);
  });

  test('blocks saving an incomplete configuration and points at the problem', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Business name is required' }).first(),
    ).toBeVisible();
    expect(brainState.puts).toHaveLength(0);
  });

  test('a failed save keeps the user’s edits and explains a conflict', async ({ page }) => {
    await openTab(page, 'Knowledge');
    brainState.version = 9; // someone else saved
    await page.getByLabel('Brand name *').fill('My edit');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'newer Brain' })).toBeVisible();
    await expect(page.getByLabel('Brand name *')).toHaveValue('My edit');
  });

  test('discard restores the last saved configuration', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('Temp');
    await page.getByRole('button', { name: /Unsaved changes/ }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Brand name *')).toHaveValue('UrbanNest (test)');
  });

  test('products: validation in the drawer, then added to the list', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByRole('button', { name: 'Add product' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add product' });
    await drawer.getByRole('button', { name: 'Add product' }).click();
    await expect(drawer.getByText('Product name is required.')).toBeVisible();
    await expect(drawer.getByText(/Enter a price in numbers/)).toBeVisible();
    await drawer.getByLabel('Name *').fill('Linen Cushion');
    await drawer.getByLabel('Price (৳) *').fill('650');
    await drawer.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByText('Linen Cushion')).toBeVisible();
  });

  test('FAQs: required fields, delete with undo', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByRole('button', { name: 'Add FAQ' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add FAQ' });
    await dlg.getByRole('button', { name: 'Save FAQ' }).click();
    await expect(dlg.getByText('Question is required.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete Do you offer COD?' }).click();
    await expect(page.getByText('No FAQs yet')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Do you offer COD?').first()).toBeVisible();
  });

  test('custom fields: key uniqueness and per-type validation', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByRole('button', { name: 'Add field' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add custom field' });
    await drawer.getByLabel('Field name *').fill('Warranty Period');
    await expect(drawer.getByLabel('Machine key *')).toHaveValue('warranty_period');
    await drawer.getByLabel('Type').selectOption('Single select');
    await drawer.getByRole('button', { name: 'Save field' }).click();
    await expect(drawer.getByText(/Add at least one option/)).toBeVisible();
    await drawer.getByLabel('Options *').fill('3 months, 6 months');
    await drawer.getByRole('button', { name: 'Save field' }).click();
    await expect(page.getByText('warranty_period · Single select')).toBeVisible();
  });

  test('business logic: add a rule and see WHEN/THEN summary; incomplete rules are flagged', async ({
    page,
  }) => {
    await openTab(page, 'Rules & Behavior');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('Incomplete', { exact: true })).toBeVisible();
    await page.getByLabel('Rule name *').fill('Ask location');
    await page.getByLabel('Action text').fill('Inside or outside Dhaka?');
    await expect(page.getByText(/WHEN customer intent is/)).toBeVisible();
    await expect(
      page.getByText(/THEN reply using knowledge: Inside or outside Dhaka\?/),
    ).toBeVisible();
  });

  test('Test your AI is clearly a rule-based preview and uses unsaved edits', async ({ page }) => {
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('Edited Name');
    await openTab(page, 'Test AI');
    await expect(page.getByText(/This is a test, not a live conversation/)).toBeVisible();
    await expect(page.getByText('Rule-based preview')).toBeVisible();
    await expect(page.getByText(/Testing your unsaved edits/)).toBeVisible();
    await page.getByLabel('Customer message').fill('Delivery charge koto?');
    await page.getByRole('button', { name: 'Send' }).click();
    const reply = page.getByRole('log', { name: 'Test conversation' });
    await expect(reply).toContainText('৳60');
    await expect(reply).toContainText('unsaved edits');
    await page.getByRole('button', { name: 'Why this reply?' }).click();
    await expect(reply).toContainText('Customer Policies: delivery fees');
  });

  test('the Test AI tab keeps its conversation when you switch away and back', async ({ page }) => {
    await openTab(page, 'Test AI');
    await page.getByLabel('Customer message').fill('Do you offer COD?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('log', { name: 'Test conversation' })).toContainText('COD');
    await openTab(page, 'Summary');
    await openTab(page, 'Test AI');
    await expect(page.getByRole('log', { name: 'Test conversation' })).toContainText('COD');
  });

  test('no horizontal overflow on a phone; Test AI becomes a tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.getByRole('tab', { name: 'Test AI' }).click();
    await expect(page.getByLabel('Customer message')).toBeVisible();
  });

  test('Summary shows the real maturity: BORN for a sparse Brain, with its score and dimensions; the journey is there too', async ({
    page,
  }) => {
    const hero = summary(page);
    await expect(hero.getByTestId('maturity-stage')).toHaveText('BORN');
    await expect(
      hero.getByRole('img', { name: /intelligence score \d+ out of 100, stage Born/ }),
    ).toBeVisible();
    // four dimensions, each a real number out of 100
    const dims = hero.getByRole('list', { name: 'Intelligence dimensions' }).getByRole('listitem');
    await expect(dims).toHaveCount(4);
    for (const n of [
      'Information Quality',
      'Knowledge Completeness',
      'Information Validity',
      'Operational Intelligence',
    ])
      await expect(dims.filter({ hasText: n }).getByText(/\/100/)).toBeVisible();
    await expect(hero.getByText('Next:')).toContainText('Baby');
    // journey (Summary): six stages, Born is current, the rest locked
    const steps = summary(page).getByRole('list', { name: 'Growth journey' }).getByRole('listitem');
    await expect(steps).toHaveCount(6);
    await expect(steps.first()).toHaveAttribute('data-state', 'current');
    await expect(steps.nth(1)).toHaveAttribute('data-state', 'locked');
    await expect(summary(page).getByText('Next:').first()).toContainText('Baby');
  });

  test('Intelligence is the import hub: honest sources, no duplicated scores', async ({ page }) => {
    await openTab(page, 'Intelligence');
    const hub = intelligence(page);
    await expect(
      hub.getByText('Connect your business data and let Torio learn automatically.'),
    ).toBeVisible();
    await expect(hub.getByRole('heading', { name: 'Scan your website' })).toBeVisible();
    const scan = hub.getByRole('button', { name: 'Scan website' });
    await expect(scan).toBeDisabled(); // no address yet
    await hub.getByLabel('Website address').fill('shop.test');
    await expect(scan).toBeEnabled();
    for (const t of ['XML product feed', 'Meta Catalog', 'Google Merchant Center'])
      await expect(hub.getByRole('heading', { name: t })).toBeVisible();
    // nothing is shown as connected, and the reason each cannot connect is stated
    await expect(hub.getByText('Not connected')).toHaveCount(3);
    await expect(hub.getByText('Connected', { exact: true })).toHaveCount(0);
    await expect(hub.getByText(/not configured/i).first()).toBeVisible();
    await expect(hub.getByText('Scans and syncs appear here once you run one.')).toBeVisible();
    // the score, dimensions and journey belong to Summary
    for (const gone of ['Intelligence score', 'Growth journey', 'Your Brain’s Growth Journey'])
      await expect(hub.getByText(gone)).toHaveCount(0);
  });

  test('website scan: scan, review, edit, approve, and only approved entries are imported', async ({
    page,
  }) => {
    await openTab(page, 'Intelligence');
    const hub = intelligence(page);
    await hub.getByLabel('Website address').fill('shop.test');
    await hub.getByRole('button', { name: 'Add details (optional)' }).click();
    await hub.getByLabel('Business country').fill('Bangladesh');
    await hub.getByRole('button', { name: 'Scan website' }).click();
    await expect
      .poll(() => scanState.body)
      .toMatchObject({ url: 'shop.test', country: 'Bangladesh' });
    // the scan finishes after a step; findings are proposals with source, confidence and warnings
    await expect(hub.getByRole('tab', { name: /All/ })).toBeVisible();
    await expect(hub.getByText('AI structuring is not configured', { exact: false })).toBeHidden();
    await hub.getByText(/note.? about this scan/).click();
    await expect(hub.getByText('AI structuring is not configured', { exact: false })).toBeVisible();
    const vase = hub.getByRole('listitem').filter({ hasText: 'Nordic Vase' });
    await expect(vase).toContainText('High confidence');
    await expect(vase).toContainText('Availability was not published');
    await expect(hub.getByRole('listitem').filter({ hasText: 'Do you deliver?' })).toContainText(
      'Low confidence',
    );
    await expect(hub.getByRole('button', { name: /^Import 0 approved/ })).toBeDisabled();
    // edit keeps the original visible
    await hub.getByRole('button', { name: 'Edit Nordic Vase' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Price').fill('1800');
    await expect(dlg.getByText('Found on the site: 1500')).toBeVisible();
    await dlg.getByRole('button', { name: 'Save changes' }).click();
    await expect(vase).toContainText('Edited');
    // approve one, reject another, import
    await hub.getByRole('button', { name: 'Approve Nordic Vase' }).click();
    await hub.getByRole('button', { name: 'Reject Do you deliver?' }).click();
    await expect(hub.getByRole('button', { name: /^Import 1 approved/ })).toBeEnabled();
    await hub.getByRole('button', { name: /^Import 1 approved/ }).click();
    await expect(hub.getByText('Imported 1 entry into Brain.')).toBeVisible();
    expect(scanState.imported).toEqual(['9d0f0000-0000-4000-8000-0000000000a2']);
    await expect(vase).toContainText('Imported');
  });

  test('XML feed: check, map, import for review, approve, import; a bad feed explains itself', async ({
    page,
  }) => {
    await openTab(page, 'Intelligence');
    const hub = intelligence(page);
    await hub.getByRole('button', { name: 'Connect a feed' }).click();
    const dlg = page.getByRole('dialog', { name: 'Connect an XML product feed' });
    const check = dlg.getByRole('button', { name: 'Check feed' });
    await expect(check).toBeDisabled();
    // a page that is not a feed is explained, and nothing is created
    await dlg.getByLabel('Feed URL').fill('https://shop.test/bad.xml');
    await check.click();
    await expect(dlg.getByRole('alert')).toContainText('does not look like a product feed');
    await dlg.getByLabel('Feed URL').fill('https://shop.test/feed.xml');
    await dlg.getByRole('button', { name: 'Check feed' }).click();
    const pv = dlg.getByRole('region', { name: 'Feed preview' });
    await expect(pv.getByText('Items in feed')).toBeVisible();
    await expect(pv).toContainText('2 items have no readable price.');
    await expect(pv.getByRole('combobox', { name: 'Name column' })).toContainText('title');
    // changing a column re-checks the feed with that mapping
    await pv.getByRole('combobox', { name: 'Price column' }).click();
    await page.getByRole('option', { name: 'cost' }).click();
    await expect
      .poll(
        () =>
          (scanState.previews.at(-1) as { mapping?: Record<string, string> }).mapping?.['price'],
      )
      .toBe('cost');
    // changing the currency invalidates the preview, so the feed is checked again before importing
    await dlg.getByLabel('Currency, only if the feed has none').fill('bdt');
    await dlg.getByRole('button', { name: 'Check feed' }).click();
    await dlg.getByRole('button', { name: /^Import 10 products for review/ }).click();
    await expect
      .poll(() => scanState.feedBody)
      .toMatchObject({ url: 'https://shop.test/feed.xml', frequency: 'manual' });
    // the sync proposes a changed and a new product; the change is spelled out
    const panel = hub.getByRole('region', { name: 'Feed import' });
    const vase = panel.getByRole('listitem').filter({ hasText: 'Nordic Vase' });
    await expect(vase).toContainText('price: 1500 → 1800');
    await expect(panel.getByRole('button', { name: /^Import 0 approved/ })).toBeDisabled();
    await panel.getByRole('button', { name: 'Approve Nordic Vase' }).click();
    await panel.getByRole('button', { name: /^Import 1 approved/ }).click();
    await expect(panel.getByText('Imported 1 entry into Brain.')).toBeVisible();
    expect(scanState.imported).toEqual(['9d0f0000-0000-4000-8000-0000000000b1']);
  });

  test('Meta Catalog: unavailable by default with the reason; never shown as connected', async ({
    page,
  }) => {
    await openTab(page, 'Intelligence');
    const card = intelligence(page)
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Meta Catalog' }) });
    await expect(card).toContainText('Not connected');
    await expect(card).toContainText('catalog_management');
    await expect(card.getByRole('button', { name: 'Connect Meta' })).toHaveCount(0);
  });

  test('Meta Catalog: connect goes to Meta’s own authorization with the catalog permissions', async ({
    page,
  }) => {
    metaState.available = true;
    let asked = '';
    await page.route('https://www.facebook.com/**', (r) => {
      asked = r.request().url();
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Meta</title>' });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openTab(page, 'Intelligence');
    await intelligence(page).getByRole('button', { name: 'Connect Meta' }).click();
    await expect.poll(() => asked).toContain('catalog_management');
  });

  test('Meta Catalog: a denied or incomplete authorization is explained when Meta sends you back', async ({
    page,
  }) => {
    metaState.available = true;
    await page.goto('/brain?tab=intelligence&meta_catalog=missing_permissions');
    await expect(intelligence(page).getByRole('alert')).toContainText(
      'did not grant catalog access',
    );
  });

  test('Meta Catalog: choose a catalog, preview, import for review, approve, import', async ({
    page,
  }) => {
    metaState.available = true;
    metaState.connected = true;
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openTab(page, 'Intelligence');
    const hub = intelligence(page);
    await hub.getByRole('button', { name: 'Choose catalog' }).click();
    const dlg = page.getByRole('dialog', { name: 'Import from a Meta catalog' });
    await expect(dlg.getByRole('button', { name: 'Choose a catalog' })).toBeDisabled();
    await dlg.getByLabel(/Main catalog/).check();
    const pv = dlg.getByRole('region', { name: 'Catalog preview' });
    await expect(pv).toContainText('Nordic Vase');
    expect(metaState.selected).toEqual(['cat1']);
    await dlg.getByRole('button', { name: 'Import 11 products for review' }).click();
    expect(metaState.syncs).toBe(1);
    const panel = hub.getByRole('region', { name: 'Feed import' });
    await panel.getByRole('button', { name: 'Approve Nordic Vase' }).click();
    await panel.getByRole('button', { name: /^Import 1 approved/ }).click();
    await expect(panel.getByText('Imported 1 entry into Brain.')).toBeVisible();
    expect(scanState.imported).toEqual(['9d0f0000-0000-4000-8000-0000000000d1']);
  });

  test('Meta Catalog: an expired connection asks to reconnect instead of syncing', async ({
    page,
  }) => {
    metaState.available = true;
    metaState.connected = true;
    metaState.status = 'ERROR';
    metaState.catalog = { id: 'cat1', name: 'Main catalog' };
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openTab(page, 'Intelligence');
    const hub = intelligence(page);
    await expect(
      hub.getByText('Meta authorization expired or was revoked. Reconnect to continue.'),
    ).toBeVisible();
    await expect(hub.getByRole('button', { name: 'Reconnect Meta' })).toBeVisible();
    await expect(hub.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  });

  test('Summary has all eight sections, in order', async ({ page }) => {
    const names = [
      'Brain overview',
      'Brain statistics',
      'Intelligence quality',
      'Brain growth journey',
      'Fix this first',
      'Knowledge readiness card',
      'Category readiness',
      'Recommended next',
    ];
    let last = -1;
    for (const n of names) {
      const r = summary(page).getByRole('region', { name: n });
      await expect(r).toBeVisible();
      const y = (await r.boundingBox())!.y + (await page.evaluate(() => window.scrollY));
      expect(y).toBeGreaterThan(last);
      last = y;
    }
  });

  test('hero: identity, Save Changes and Test AI, intelligence ring, stage, next stage and requirements', async ({
    page,
  }) => {
    const hero = summary(page).getByRole('region', { name: 'Brain overview' });
    await expect(hero.getByText('Your business. Your rules. Your AI.')).toBeVisible();
    await expect(hero.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await expect(
      hero.getByRole('img', { name: /intelligence score \d+ out of 100/ }),
    ).toBeVisible();
    await expect(hero.getByText(/Next:/)).toBeVisible();
    await expect(hero.getByRole('progressbar', { name: /Progress to/ })).toBeVisible();
    // the header does not repeat the save actions while the hero shows them
    await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(1);
    await hero.getByRole('button', { name: 'Test AI' }).click();
    await expect(page).toHaveURL(/tab=test/);
    await expect(page.getByLabel('Customer message')).toBeVisible();
  });

  test('six KPI cards come from real data and use their own measures', async ({ page }) => {
    const stats = summary(page).getByRole('region', { name: 'Brain statistics' });
    const card = (l: string) =>
      stats.getByRole('listitem').filter({ hasText: new RegExp(`^${l}`) });
    for (const l of [
      'Setup completion',
      'Active rules',
      'Custom fields',
      'Knowledge base',
      'Issues',
      'Last saved',
    ])
      await expect(card(l)).toBeVisible();
    await expect(card('Setup completion')).toContainText('%');
    await expect(card('Issues')).toContainText('Configuration valid');
    await expect(card('Last saved')).toContainText(/ago|Just now/);
  });

  test('Fix this first shows a success state when nothing blocks the Brain', async ({ page }) => {
    const fix = summary(page).getByRole('region', { name: 'Fix this first' });
    await expect(fix.getByText('No blocking issues')).toBeVisible();
  });

  test('the eight readiness categories show the real percentages and open their section', async ({
    page,
  }) => {
    const d: BrainConfig = emptyBrainConfig();
    d.identity = {
      ...d.identity,
      name: 'Lumi',
      category: 'Education',
      country: 'Bangladesh',
      description: 'Online courses for school students.',
    };
    d.faqs = [
      {
        id: 'f1',
        q: 'Are classes recorded?',
        a: 'Yes, every class is recorded.',
        cat: 'General',
        active: true,
      },
    ];
    brainState.config = d;
    await page.reload();
    const expected = areas(d);
    const cats = summary(page).getByRole('region', { name: 'Category readiness' });
    const titles: Record<string, string> = {
      identity: 'Business Profile',
      products: 'Product Knowledge',
      shipping: 'Shipping Policy',
      returns: 'Return Policy',
      fields: 'Custom Fields',
      instructions: 'Custom Instructions',
      logic: 'Business Logic',
      faqs: 'FAQs',
    };
    await expect(cats.getByRole('button')).toHaveCount(8);
    for (const a of expected)
      await expect(
        cats.getByRole('button', {
          name: `${titles[a.key]}, ${Math.round(a.pct * 100)}% complete`,
        }),
      ).toBeVisible();
    // the card percentage is the shared readiness calculation
    await expect(
      summary(page).getByRole('progressbar', { name: 'Knowledge readiness' }),
    ).toHaveAttribute('aria-valuenow', String(readinessPct(expected)));
    await cats.getByRole('button', { name: /^Product Knowledge/ }).click();
    await expect(page).toHaveURL(/tab=knowledge/);
    await expect(page.getByRole('heading', { name: 'Products & Catalog' })).toBeInViewport();
  });

  test('Knowledge readiness is the readiness percentage, separate from the intelligence score', async ({
    page,
  }) => {
    const card = summary(page).getByRole('region', { name: 'Knowledge readiness card' });
    const shown = Number(
      await card
        .getByRole('progressbar', { name: 'Knowledge readiness' })
        .getAttribute('aria-valuenow'),
    );
    const hero = summary(page).getByRole('region', { name: 'Brain overview' });
    const score = Number(
      /score (\d+)/.exec(
        (await hero.getByRole('img', { name: /intelligence score/ }).getAttribute('aria-label'))!,
      )![1],
    );
    expect(shown).toBeGreaterThanOrEqual(0);
    expect(shown).not.toBe(score); // different measures
    await expect(card.getByText(/not whether the information is correct/)).toBeVisible();
  });

  test('Recommended next: prioritized, Fix opens the section and focuses its first field', async ({
    page,
  }) => {
    const rec = summary(page).getByRole('region', { name: 'Recommended next' });
    await expect(rec.getByRole('listitem').first()).toContainText(/High|Medium|Low/);
    await rec.getByRole('button', { name: 'Fix' }).first().click();
    await expect(page).toHaveURL(/tab=(knowledge|rules)/);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('section')?.id ?? ''))
      .not.toBe('');
  });

  test('a richer saved Brain moves the stage, and the journey reflects the server’s evaluation', async ({
    page,
  }) => {
    const d: BrainConfig = emptyBrainConfig();
    d.identity = {
      ...d.identity,
      name: 'Lumi Learning',
      category: 'Education',
      country: 'Bangladesh',
      website: 'https://lumi.example.com',
      description:
        'Lumi Learning runs live online courses in spoken English and coding for school students.',
      audience: 'Parents of students from grade six to ten who want structured weekend classes',
      usp: 'Small batches of eight students with weekly progress reports for parents',
      positioning: 'Affordable, structured and friendly online tuition for school students',
    };
    d.products = ['Spoken English', 'Python Basics', 'Math Olympiad'].map((n, i) => ({
      id: `p${i}`,
      name: n,
      category: 'Course',
      description: `${n} is an eight week live course with weekly assignments, recorded sessions and a certificate at the end.`,
      price: '3000',
      variants: '',
      sizes: '',
      colors: '',
      stock: 'In stock' as const,
      benefits: 'Builds confidence through live practice and personal feedback every week',
      usage: 'Join from any device using the class link sent on the morning of each session',
      limitations: 'Not suitable for students below grade five',
      faqs: '',
    }));
    d.faqs = [
      [
        'What age group is this for?',
        'Students from grade six to ten, grouped into small batches by level.',
      ],
      [
        'Are classes recorded?',
        'Yes, every live session is recorded and shared within two hours after class.',
      ],
      [
        'How do I pay the fee?',
        'Pay through bKash or card at checkout; instalments are available for longer courses.',
      ],
    ].map(([q, a], i) => ({ id: `f${i}`, q: q!, a: a!, cat: 'General' as const, active: true }));
    brainState.config = d;
    const expected = evaluateMaturity(d);
    expect(expected.stage).not.toBe('BORN');
    await page.reload();
    const hero = summary(page);
    await expect(hero.getByTestId('maturity-stage')).toHaveText(expected.stage);
    await expect(page.getByTitle(new RegExp(`Brain stage: ${expected.stage}`, 'i'))).toBeVisible();
    await expect(
      hero.getByRole('img', { name: new RegExp(`score ${expected.score} out of 100`) }),
    ).toBeVisible();
    const steps = summary(page).getByRole('list', { name: 'Growth journey' }).getByRole('listitem');
    for (let i = 0; i < 6; i++)
      await expect(steps.nth(i)).toHaveAttribute(
        'data-state',
        i < expected.stageIndex ? 'done' : i === expected.stageIndex ? 'current' : 'locked',
      );
    // the dimension numbers on screen are the engine's
    for (const x of expected.dimensions)
      await expect(
        summary(page).getByRole('progressbar', { name: x.label, exact: true }).first(),
      ).toHaveAttribute('aria-valuenow', String(x.score));
  });

  test('saving updates the evaluation from the server; unsaved edits are not scored', async ({
    page,
  }) => {
    const hero = summary(page);
    const score = async () =>
      Number(
        /score (\d+)/.exec(
          (await hero.getByRole('img', { name: /intelligence score/ }).getAttribute('aria-label'))!,
        )![1],
      );
    const before = await score();
    await openTab(page, 'Knowledge');
    await page
      .getByLabel('Brand description')
      .fill(
        'UrbanNest sells handmade ceramic vases, planters and table lamps designed for small Dhaka apartments.',
      );
    await openTab(page, 'Summary');
    await expect(hero.getByText(/describe your last saved Brain/)).toBeVisible();
    expect(await score()).toBe(before); // not scored until saved
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Brain saved.')).toBeVisible();
    await expect(hero.getByText(/describe your last saved Brain/)).toHaveCount(0);
    await expect.poll(score).toBeGreaterThan(before);
  });

  test('a real validation problem shows in the Issues card and becomes the first thing to fix', async ({
    page,
  }) => {
    const d = emptyBrainConfig();
    d.identity.name = 'UrbanNest';
    d.instructions = [
      {
        id: 'i1',
        title: 'Greeting',
        content: '',
        category: 'General',
        priority: 'High',
        enabled: true,
        conditions: '',
        example: '',
        expected: '',
      },
    ];
    brainState.config = d;
    await page.reload();
    const hero = summary(page);
    await expect(hero.getByText('Fix before saving')).toBeVisible();
    const fix = hero.getByRole('region', { name: 'Fix this first' });
    await expect(fix.getByText('Fix this first', { exact: true })).toBeVisible();
    await expect(fix.getByText(/stops this Brain from being saved/)).toBeVisible();
    await expect(fix.getByText('Custom Instructions')).toBeVisible();
    await expect(hero.getByText('Configuration valid')).toHaveCount(0);
    await fix.getByRole('button', { name: 'Fix' }).click();
    await expect(page).toHaveURL(/tab=rules/);
    await expect(page.getByRole('heading', { name: 'Custom Instructions' })).toBeInViewport();
  });

  test('shipping providers and payment methods are cards, with honest status and no connection claims', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    const ship = page.getByRole('region', { name: 'Shipping Providers' });
    await expect(
      ship.getByText('Manage the courier services available to your store.'),
    ).toBeVisible();
    await expect(ship.getByText('1 added')).toBeVisible();
    const pathao = ship.getByRole('listitem').filter({ hasText: 'Pathao' });
    await expect(pathao).toContainText('Courier service');
    await expect(pathao).toContainText('Listed in Brain');
    await expect(ship.getByRole('button', { name: /Add Shipping Provider/ })).toBeVisible();
    const pay = page.getByRole('region', { name: 'Payment Methods' });
    await expect(
      pay.getByText('Manage how your customers can pay for their orders.'),
    ).toBeVisible();
    await expect(pay.getByRole('listitem').filter({ hasText: 'bKash' })).toContainText(
      'Mobile financial service',
    );
    await expect(pay.getByRole('button', { name: /Add Payment Method/ })).toBeVisible();
    // there is no courier or gateway connection behind these lists, so nothing may claim one
    for (const r of [ship, pay])
      await expect(r.getByText(/Connected|Test connection|credential|API key/i)).toHaveCount(0);
    // the old pill toggles are gone
    await expect(page.getByRole('button', { name: 'Pathao', exact: true })).toHaveCount(0);
  });

  test('supplied courier logos are real local images with their own aspect ratio, and say nothing about connection', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    const ship = page.getByRole('region', { name: 'Shipping Providers' });
    for (const n of ['Steadfast', 'RedX']) {
      await ship.getByRole('button', { name: /Add Shipping Provider/ }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: new RegExp(n) })
        .click();
    }
    const logos = [
      ['Pathao Courier logo', 1200 / 1200],
      ['Steadfast Courier logo', 640 / 256],
      ['REDX logo', 1024 / 500],
    ] as const;
    for (const [alt, ratio] of logos) {
      const img = ship.getByRole('img', { name: alt });
      await expect(img).toBeVisible();
      const info = await img.evaluate((el: HTMLImageElement) => ({
        ok: el.complete && el.naturalWidth > 0,
        src: el.currentSrc,
        w: el.naturalWidth,
        h: el.naturalHeight,
        fit: getComputedStyle(el).objectFit,
      }));
      expect(info.ok).toBe(true);
      expect(new URL(info.src).origin).toBe(new URL(page.url()).origin); // local asset, no hotlink
      expect(info.fit).toBe('contain');
      expect(Math.abs(info.w / info.h - ratio)).toBeLessThan(0.02); // original proportions
    }
    // other couriers have no supplied artwork, so they show a neutral monogram, never an invented logo
    await ship.getByRole('button', { name: /Add Shipping Provider/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Sundarban/ })
      .click();
    await expect(ship.getByRole('img', { name: /Sundarban/ })).toHaveCount(0);
    await expect(ship.getByText(/Connected/i)).toHaveCount(0);
  });

  test('add a provider from the picker: search, select, saved with the Brain', async ({ page }) => {
    await openTab(page, 'Knowledge');
    const ship = page.getByRole('region', { name: 'Shipping Providers' });
    await ship.getByRole('button', { name: /Add Shipping Provider/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Add shipping provider' });
    await expect(dlg.getByRole('button', { name: /Pathao/ })).toBeDisabled(); // already added
    await expect(dlg.getByText('Added')).toBeVisible();
    await dlg.getByLabel('Search').fill('red');
    await expect(dlg.getByRole('button', { name: /Steadfast/ })).toHaveCount(0);
    await dlg.getByRole('button', { name: /RedX/ }).click();
    await expect(dlg).toHaveCount(0);
    await expect(ship.getByRole('listitem').filter({ hasText: 'RedX' })).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Brain saved.')).toBeVisible();
    const put = brainState.puts.at(-1) as { config: { shipping: { providers: string[] } } };
    expect(put.config.shipping.providers).toEqual(['Pathao', 'RedX']);
  });

  test('duplicates are prevented, including a custom name in another case', async ({ page }) => {
    await openTab(page, 'Knowledge');
    const ship = page.getByRole('region', { name: 'Shipping Providers' });
    await ship.getByRole('button', { name: /Add Shipping Provider/ }).click();
    let dlg = page.getByRole('dialog', { name: 'Add shipping provider' });
    await dlg.getByLabel('Search').fill('Local Rider');
    await dlg.getByRole('button', { name: /Add “Local Rider”/ }).click();
    await expect(ship.getByRole('listitem').filter({ hasText: 'Local Rider' })).toContainText(
      'Custom provider',
    );
    await ship.getByRole('button', { name: /Add Shipping Provider/ }).click();
    dlg = page.getByRole('dialog', { name: 'Add shipping provider' });
    await dlg.getByLabel('Search').fill('local rider');
    await dlg.getByRole('button', { name: /Add “local rider”/ }).click();
    await expect(dlg.getByRole('alert')).toContainText('already added');
    await dlg.getByLabel('Search').press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(ship.getByRole('listitem').filter({ hasText: /Local Rider/i })).toHaveCount(1);
  });

  test('the card menu is keyboard accessible and removes only that entry', async ({ page }) => {
    await openTab(page, 'Knowledge');
    const pay = page.getByRole('region', { name: 'Payment Methods' });
    await pay.getByRole('button', { name: 'Add Payment Method' }).click();
    await page
      .getByRole('dialog', { name: 'Add payment method' })
      .getByRole('button', { name: /Nagad/ })
      .click();
    const trigger = pay.getByRole('button', { name: 'Actions for bKash' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const item = page.getByRole('menuitem', { name: 'Remove' });
    await expect(item).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(item).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(pay.getByRole('listitem').filter({ hasText: 'bKash' })).toHaveCount(0);
    await expect(pay.getByRole('listitem').filter({ hasText: 'Nagad' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unsaved changes/ })).toBeVisible();
  });

  test('an empty list shows an empty state with the Add card; cards stay in one column on a phone', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    const pay = page.getByRole('region', { name: 'Payment Methods' });
    await pay.getByRole('button', { name: 'Actions for bKash' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(pay.getByText('No payment methods yet.')).toBeVisible();
    await expect(pay.getByRole('button', { name: /Add Payment Method/ })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const ship = page.getByRole('region', { name: 'Shipping Providers' });
    await ship.scrollIntoViewIfNeeded();
    const a = (await ship.getByRole('listitem').first().boundingBox())!;
    const b = (await ship.getByRole('button', { name: /Add Shipping Provider/ }).boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(2); // stacked, not side by side
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });

  test('header: identity, stage badge, setup progress from real data, last saved', async ({
    page,
  }) => {
    const header = page.locator('main header').first();
    await expect(header.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
    await expect(header.getByTestId('header-stage')).toHaveText(/BORN/);
    await expect(header.getByText('Setup Progress')).toBeVisible();
    const bar = header.getByRole('progressbar', { name: 'Setup progress' });
    const shown = Number(await bar.getAttribute('aria-valuenow'));
    // the same readiness percentage the Summary's Knowledge readiness shows
    await expect(
      summary(page).getByRole('progressbar', { name: 'Knowledge readiness' }),
    ).toHaveAttribute('aria-valuenow', String(shown));
    await expect(
      header.getByText(/Last saved .*ago|Last saved Just now|Never saved/),
    ).toBeVisible();
    await openTab(page, 'Knowledge');
    await page.getByLabel('Brand name *').fill('Changed');
    await expect(header.getByText('Unsaved changes').first()).toBeVisible();
  });

  test('tabs: soft active background, keyboard navigation, and no overflow at tablet and phone widths', async ({
    page,
  }) => {
    const active = page.getByRole('tab', { name: 'Summary' });
    const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    await active.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Intelligence' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Test AI' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Home');
    await expect(active).toHaveAttribute('aria-selected', 'true');
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
      for (const t of ['Summary', 'Intelligence', 'Knowledge', 'Rules & Behavior', 'Test AI'])
        await expect(page.getByRole('tab', { name: t })).toBeAttached();
    }
  });

  test('growth journey: six distinct stage identities, the current one animates, locked ones are marked', async ({
    page,
  }) => {
    const palette: Record<string, string> = {
      BORN: 'rgb(91, 92, 226)',
      BABY: 'rgb(217, 119, 6)',
      GROWING: 'rgb(5, 150, 105)',
      SMART: 'rgb(37, 99, 235)',
      MATURE: 'rgb(124, 58, 237)',
      EXPERT: 'rgb(183, 121, 31)',
    };
    const journey = summary(page).getByRole('list', { name: 'Growth journey' });
    const seen = new Set<string>();
    for (const [stage, rgb] of Object.entries(palette)) {
      const node = journey.locator(`[data-stage-icon="${stage}"]`);
      const colors = await node.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fg: cs.color, bg: cs.backgroundColor };
      });
      seen.add(colors.bg);
      // current (BORN) and completed stages use their own primary; locked ones are muted, never another stage's colour
      if (stage === 'BORN') expect(colors.fg).toBe(rgb);
      else expect(Object.values(palette)).not.toContain(colors.fg);
    }
    expect(seen.size).toBeGreaterThan(1);
    // exactly the current stage animates
    const animated = await journey
      .locator('[data-stage-icon]')
      .evaluateAll((els) => els.filter((e) => getComputedStyle(e).animationName !== 'none').length);
    expect(animated).toBe(1);
    await expect(journey.locator('[data-stage-icon="BORN"]')).toHaveClass(/stage-anim-born/);
    await expect(journey.getByRole('listitem').nth(3)).toContainText('Locked');
    await expect(journey.getByRole('listitem').nth(3)).toContainText(`needs ${STAGE_MIN.SMART}+`);
  });

  test('reduced motion switches the stage animations off', async ({ page }) => {
    const node = summary(page).locator('[data-stage-icon="BORN"]');
    expect(await node.evaluate((e) => getComputedStyle(e).animationName)).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await node.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });

  test('stage detail: current and locked stages tell the truth about what is needed', async ({
    page,
  }) => {
    const journey = summary(page).getByRole('list', { name: 'Growth journey' });
    const detail = summary(page).getByTestId('stage-detail');
    // the current stage is shown first
    await expect(detail).toContainText('Born');
    await expect(detail).toContainText('You are here');
    await expect(detail).toContainText('Remaining for the next stage');
    await journey.getByRole('button', { name: /^Smart, locked/ }).click();
    await expect(detail).toContainText('Smart');
    await expect(detail).toContainText('Locked');
    await expect(detail).not.toContainText('You are here');
    await expect(detail).toContainText(`Intelligence score ${STAGE_MIN.SMART} or more`);
    await expect(detail).toContainText('Still needed to unlock');
    await expect(detail).toContainText(`Score ${STAGE_MIN.SMART}–${STAGE_MIN.MATURE - 1}`);
    await journey.getByRole('button', { name: /^Expert, locked/ }).click();
    await expect(detail).toContainText(`Score ${STAGE_MIN.EXPERT}–100`);
  });

  test('the connector fills with the engine’s real progress, in each completed stage’s colour', async ({
    page,
  }) => {
    const d: BrainConfig = emptyBrainConfig();
    d.identity = {
      ...d.identity,
      name: 'Lumi Learning',
      category: 'Education',
      country: 'Bangladesh',
      website: 'https://lumi.example.com',
      description:
        'Lumi Learning runs live online courses in spoken English and coding for school students.',
      audience: 'Parents of students from grade six to ten who want structured weekend classes',
      usp: 'Small batches of eight students with weekly progress reports for parents',
      positioning: 'Affordable, structured and friendly online tuition for school students',
    };
    brainState.config = d;
    const m = evaluateMaturity(d);
    expect(m.stageIndex).toBeGreaterThanOrEqual(1);
    await page.reload();
    const fills = await summary(page).evaluate(
      (root, n) =>
        Array.from({ length: n }, (_, i) => {
          const f = root.querySelector(`[data-connector="${i}"] > span`) as HTMLElement | null;
          return f ? parseFloat(f.style.width) : null;
        }),
      5,
    );
    for (let i = 0; i < 5; i++) {
      const expected = i < m.stageIndex ? 100 : i === m.stageIndex ? m.progressToNext * 100 : 0;
      expect(Math.abs((fills[i] ?? -1) - expected)).toBeLessThan(0.6);
    }
  });

  test('unlocking a stage by saving celebrates it once; the stage badge follows the server', async ({
    page,
  }) => {
    await openTab(page, 'Knowledge');
    await page
      .getByLabel('Brand description')
      .fill(
        'UrbanNest sells handmade ceramic vases, planters and table lamps designed for small Dhaka apartments.',
      );
    await page
      .getByLabel('Target audience')
      .fill('Young Dhaka professionals who rent small apartments and want warm, simple decor');
    await page
      .getByLabel('Brand positioning')
      .fill('Affordable handmade decor that makes small spaces feel calm and personal');
    await page
      .getByLabel('Unique selling proposition')
      .fill('Every piece is handmade in Dhaka and ships within two working days');
    await page.getByLabel('Website URL').fill('https://urbannest.example.com');
    await openTab(page, 'Summary');
    await expect(summary(page).getByTestId('maturity-stage')).toHaveText('BORN');
    await summary(page).getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Brain saved.')).toBeVisible();
    await expect(summary(page).getByTestId('maturity-stage')).not.toHaveText('BORN');
    await expect(summary(page).getByText('Unlocked')).toBeVisible();
    await expect(page.getByTestId('header-stage')).not.toHaveText(/BORN/);
  });

  test('the hero fits a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brain');
    await expect(summary(page).getByTestId('maturity-stage')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test('agents can read Brain but not edit or save it', async ({ page }) => {
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/brain?tab=knowledge');
  await expect(page.getByText(/only admins and owners can edit it/).first()).toBeVisible();
  await expect(page.getByLabel('Brand name *')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(0);
});
