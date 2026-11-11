import { expect, test } from '@playwright/test';
import { emptyBrainConfig, evaluateMaturity, type BrainConfig } from '@torio/contracts';
import { brainState, mockApi } from './mocks';

test.describe('brain (admin)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test.beforeEach(async ({ page }) => {
    brainState.version = 3;
    brainState.puts.length = 0;
    brainState.config = null;
    await mockApi(page, { role: 'ADMIN' });
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
  });

  test('shows the header, readiness computed from the form, and section navigation', async ({
    page,
  }) => {
    await expect(page.getByText('Your business. Your rules. Your AI.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Knowledge readiness' })).toBeVisible();
    await expect(page.getByText(/measures how complete your configuration is/)).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Brain sections' })
      .getByRole('button', { name: 'Knowledge Base' })
      .click();
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeInViewport();
  });

  test('tracks unsaved changes, saves with the base version, and clears the indicator', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await page.getByLabel('Brand name *').fill('UrbanNest Renamed');
    await expect(page.getByRole('button', { name: /Unsaved changes \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Brain saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unsaved changes/ })).toHaveCount(0);
    expect((brainState.puts[0] as { baseVersion: number }).baseVersion).toBe(3);
  });

  test('blocks saving an incomplete configuration and points at the problem', async ({ page }) => {
    await page.getByLabel('Brand name *').fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Business name is required' }).first(),
    ).toBeVisible();
    expect(brainState.puts).toHaveLength(0);
  });

  test('a failed save keeps the user’s edits and explains a conflict', async ({ page }) => {
    brainState.version = 9; // someone else saved
    await page.getByLabel('Brand name *').fill('My edit');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'newer Brain' })).toBeVisible();
    await expect(page.getByLabel('Brand name *')).toHaveValue('My edit');
  });

  test('discard restores the last saved configuration', async ({ page }) => {
    await page.getByLabel('Brand name *').fill('Temp');
    await page.getByRole('button', { name: /Unsaved changes/ }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Brand name *')).toHaveValue('UrbanNest (test)');
  });

  test('products: validation in the drawer, then added to the list', async ({ page }) => {
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
    await expect(page.getByText('Rule-based preview')).toBeVisible();
    await page.getByLabel('Brand name *').fill('Edited Name');
    await expect(page.getByText(/Testing your unsaved edits/)).toBeVisible();
    await page.getByLabel('Customer message').fill('Delivery charge koto?');
    await page.getByRole('button', { name: 'Send' }).click();
    const reply = page.getByRole('log', { name: 'Test conversation' });
    await expect(reply).toContainText('৳60');
    await expect(reply).toContainText('unsaved edits');
    await page.getByRole('button', { name: 'Why this reply?' }).click();
    await expect(reply).toContainText('Customer Policies: delivery fees');
  });

  test('the Test AI button focuses the playground', async ({ page }) => {
    await page.getByRole('button', { name: 'Test AI' }).click();
    await expect(page.getByLabel('Customer message')).toBeFocused();
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

  test('the hero shows the real maturity: BORN for a sparse Brain, with its score, dimensions and journey', async ({
    page,
  }) => {
    const hero = page.getByRole('region', { name: 'Brain overview' });
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
    // journey: six stages, Born is current, the rest locked
    const steps = hero.getByRole('list', { name: 'Growth journey' }).getByRole('listitem');
    await expect(steps).toHaveCount(6);
    await expect(steps.first()).toHaveAttribute('data-state', 'current');
    await expect(steps.nth(1)).toHaveAttribute('data-state', 'locked');
    await expect(hero.getByText('Next:')).toContainText('Baby');
  });

  test('setup completion and issues come from real data, and last saved is honest', async ({
    page,
  }) => {
    const hero = page.getByRole('region', { name: 'Brain overview' });
    await expect(hero.getByText('Setup completion', { exact: true })).toBeVisible();
    await expect(hero.getByText('Configuration valid')).toBeVisible();
    await expect(hero.getByText('Active rules', { exact: true })).toBeVisible();
    await expect(hero.getByText('Custom fields', { exact: true })).toBeVisible();
    await expect(hero.getByText('Knowledge base', { exact: true })).toBeVisible();
    await expect(hero.getByText(/ago|Just now|Never/).first()).toBeVisible();
  });

  test('the next step is the highest-priority gap and its button opens that section', async ({
    page,
  }) => {
    const cta = page.getByRole('button', { name: 'Complete Business Profile' });
    await expect(cta).toBeVisible();
    await expect(page.getByText('Your next step')).toBeVisible();
    await page.getByRole('heading', { name: 'Knowledge Base' }).scrollIntoViewIfNeeded();
    await cta.click();
    await expect(page.getByRole('heading', { name: 'Business Profile' })).toBeInViewport();
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
    const hero = page.getByRole('region', { name: 'Brain overview' });
    await expect(hero.getByTestId('maturity-stage')).toHaveText(expected.stage);
    await expect(
      hero.getByRole('img', { name: new RegExp(`score ${expected.score} out of 100`) }),
    ).toBeVisible();
    const steps = hero.getByRole('list', { name: 'Growth journey' }).getByRole('listitem');
    for (let i = 0; i < 6; i++)
      await expect(steps.nth(i)).toHaveAttribute(
        'data-state',
        i < expected.stageIndex ? 'done' : i === expected.stageIndex ? 'current' : 'locked',
      );
    await expect(
      hero.getByText('Knowledge base', { exact: true }).locator('..').locator('..'),
    ).toContainText('3');
    // the dimension numbers on screen are the engine's
    for (const x of expected.dimensions)
      await expect(hero.getByRole('progressbar', { name: x.label, exact: true })).toHaveAttribute(
        'aria-valuenow',
        String(x.score),
      );
  });

  test('saving updates the evaluation from the server; unsaved edits are not scored', async ({
    page,
  }) => {
    const hero = page.getByRole('region', { name: 'Brain overview' });
    const score = async () =>
      Number(
        /score (\d+)/.exec(
          (await hero.getByRole('img', { name: /intelligence score/ }).getAttribute('aria-label'))!,
        )![1],
      );
    const before = await score();
    await page
      .getByLabel('Brand description')
      .fill(
        'UrbanNest sells handmade ceramic vases, planters and table lamps designed for small Dhaka apartments.',
      );
    await expect(hero.getByText(/Scores describe your last saved Brain/)).toBeVisible();
    expect(await score()).toBe(before); // not scored until saved
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Brain saved.')).toBeVisible();
    await expect(hero.getByText(/Scores describe your last saved Brain/)).toHaveCount(0);
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
    const hero = page.getByRole('region', { name: 'Brain overview' });
    await expect(hero.getByText('Fix before saving')).toBeVisible();
    await expect(hero.getByText('Fix this first')).toBeVisible();
    await expect(hero.getByText('Configuration valid')).toHaveCount(0);
  });

  test('shipping providers and payment methods are cards, with honest status and no connection claims', async ({
    page,
  }) => {
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

  test('the hero fits a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brain');
    await expect(page.getByTestId('maturity-stage')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test('agents can read Brain but not edit or save it', async ({ page }) => {
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/brain');
  await expect(page.getByText(/only admins and owners can edit it/)).toBeVisible();
  await expect(page.getByLabel('Brand name *')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(0);
});
