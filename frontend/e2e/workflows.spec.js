
import { test, expect } from '@playwright/test';

// Run against a disposable database only.
const user = process.env.E2E_USERNAME || 'ciadmin';
const password = process.env.E2E_PASSWORD || 'CiTestPassword!2026';

const makeName = (prefix) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function login(page) {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password', { exact: true }).fill(password);

  await page.getByRole('button', {
    name: 'Sign in to workspace'
  }).click();

  await expect(
    page.getByRole('heading', { name: 'Institutions & Courses' })
  ).toBeVisible();
}

async function makeSection(page, name) {
  await page.locator('.page-content')
    .getByRole('button', {
      name: /^(Create a section|New section)$/
    })
    .first()
    .click();

  const dlg = page.getByRole('dialog', {
    name: 'Create new section'
  });

  await dlg.getByLabel('Section name').fill(name);
  await dlg.getByLabel('Record type (singular)').fill('Institute');
  await dlg.getByLabel('Column type (singular)').fill('Course');
  await dlg.getByLabel('Amount unit (optional)').fill('INR');

  await dlg.getByRole('button', {
    name: 'Create section'
  }).click();

  await expect(
    page.locator('.section-overview h2')
  ).toHaveText(name);
}

async function addColumn(page, name) {
  await page.getByRole('button', {
    name: 'Add Course'
  }).click();

  const dlg = page.getByRole('dialog', {
    name: 'Add course'
  });

  await dlg.getByLabel('Course name').fill(name);

  await dlg.getByRole('button', {
    name: 'Save'
  }).click();

  await expect(dlg).not.toBeVisible();

  // The table is hidden until the first institution exists.
  // Verify the course through the Columns manager instead.

  await page.getByRole('button', {
    name: 'Columns'
  }).click();

  const manager = page.getByRole('dialog', {
    name: 'Manage courses'
  });

  await expect(
    manager.getByRole('checkbox', {
      name: `Select ${name}`,
      exact: true
    })
  ).toBeVisible();

  await manager.getByRole('button', {
    name: 'Close'
  }).click();

  await expect(manager).not.toBeVisible();
}

async function addRecord(page, name, course, amount) {
  await page.locator('.panel-actions')
    .getByRole('button', {
      name: 'Add Institute'
    })
    .click();

  const dlg = page.getByRole('dialog', {
    name: 'Add institute'
  });

  await dlg.getByLabel('Institute name').fill(name);

  if (course) {
    await dlg.getByLabel(course).fill(amount);
  }

  await dlg.getByRole('button', {
    name: 'Add Institute'
  }).click();

  await expect(
    page.getByRole('row').filter({
      hasText: name
    })
  ).toBeVisible();

  if (course) {
    await expect(
      page.getByRole('columnheader', {
        name: course,
        exact: true
      })
    ).toBeVisible();
  }
}

async function confirmDeletion(page, label) {
  const dlg = page.locator('.modal-backdrop')
    .last()
    .getByRole('dialog');

  await expect(dlg).toBeVisible();

  await dlg.getByRole('button', {
    name: label
  }).click();

  await expect(dlg).not.toBeVisible();
}

async function deleteSection(page, name) {
  await page.getByRole('button', {
    name: 'Section settings'
  }).click();

  await page.getByRole('dialog', {
    name: 'Section settings'
  }).getByRole('button', {
    name: 'Delete section'
  }).click();

  await confirmDeletion(page, 'Delete entire section');

  await expect(
    page.locator('.section-tabs')
      .getByRole('button', { name })
  ).toHaveCount(0);
}

// ============================================================
// TEST 1: DESKTOP CRUD, EDITING, CSV, PDF, AUTHENTICATION
// ============================================================

test(
  'real browser: login, section/column/record CRUD, cell/bulk edit, CSV/PDF, delete, refresh and logout',
  async ({ page }) => {
    const section = makeName('E2E Test');
    const course = makeName('Java');
    const second = makeName('Python');
    const institute = makeName('Institute');
    const other = makeName('Second');

    await login(page);

    try {
      await makeSection(page, section);

      await addColumn(page, course);
      await addColumn(page, second);

      await addRecord(page, institute, course, '150.25');
      await addRecord(page, other, course, '75.00');

      // Inline single-cell editing.
      const row = page.getByRole('row').filter({
        hasText: institute
      });

      await row.locator('.cell-value').first().click();

      const inline = row.getByRole('textbox', {
        name: 'Edit amount'
      });

      await inline.fill('175.50');
      await inline.press('Enter');

      await expect(row).toContainText('175.50');

      // Edit the complete institute form.
      await row.getByRole('button', {
        name: `Edit ${institute}`
      }).click();

      const form = page.getByRole('dialog', {
        name: 'Edit institute'
      });

      await form.getByLabel(second).fill('12.00');

      await form.getByRole('button', {
        name: 'Save changes'
      }).click();

      await expect(row).toContainText('12.00');

      // Atomic bulk editing.
      await page.getByRole('button', {
        name: 'Edit grid'
      }).click();

      await expect(
        row.getByRole('button', {
          name: `Delete ${institute}`
        })
      ).toBeDisabled();

      await page.getByRole('textbox', {
        name: `${institute} ${second} amount`
      }).fill('35.20');

      await page.getByRole('button', {
        name: 'Save 1 change'
      }).click();

      await expect(row).toContainText('35.20');

      // Verify CSV export.
      const csvPromise = page.waitForEvent('download');

      await page.getByRole('button', {
        name: 'More actions'
      }).click();

      await page.getByRole('button', {
        name: 'Export CSV'
      }).click();

      const csv = await csvPromise;

      expect(csv.suggestedFilename()).toMatch(/\.csv$/);

      const fs = await import('node:fs/promises');
      const csvContents = await fs.readFile(
        await csv.path(),
        'utf8'
      );

      expect(csvContents).toContain(institute);
      expect(csvContents).toContain(course);
      expect(csvContents).toContain('175.50');

      // Verify PDF export.
      const pdfPromise = page.waitForEvent('download');

      await page.getByRole('button', {
        name: 'Export PDF'
      }).first().click();

      const pdf = await pdfPromise;

      expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);

      const bytes = await fs.readFile(await pdf.path());

      expect(
        bytes.subarray(0, 5).toString()
      ).toBe('%PDF-');

      // Test refresh after an injected expired-access response.
      await page.route('**/api/sections', async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"message":"Expired access JWT"}'
        });

        await page.unroute('**/api/sections');
      });

      await page.reload();

      await expect(
        page.locator('.section-overview h2')
      ).toHaveText(section);

      // Rename a course.
      await page.getByRole('button', {
        name: 'Columns'
      }).click();

      await page.getByRole('button', {
        name: `Rename ${second}`
      }).click();

      const renamed = second + ' Updated';

      const renameDialog = page.getByRole('dialog', {
        name: 'Rename course'
      });

      await renameDialog.getByLabel('Course name').fill(renamed);

      await renameDialog.getByRole('button', {
        name: 'Save'
      }).click();

      await expect(
        page.getByRole('columnheader', {
          name: renamed
        })
      ).toBeVisible();

      // Delete multiple institutions.
      await page.getByRole('checkbox', {
        name: `Select ${institute}`
      }).check();

      await page.getByRole('checkbox', {
        name: `Select ${other}`
      }).check();

      await page.getByRole('button', {
        name: 'Delete rows'
      }).click();

      await confirmDeletion(page, 'Delete selected');

      await expect(
        page.getByRole('row').filter({
          hasText: institute
        })
      ).toHaveCount(0);

      await expect(
        page.getByRole('heading', {
          name: 'No institutes yet'
        })
      ).toBeVisible();

      // Delete multiple courses.
      await page.getByRole('button', {
        name: 'Columns'
      }).click();

      await page.getByRole('checkbox', {
        name: `Select ${course}`
      }).check();

      await page.getByRole('checkbox', {
        name: `Select ${renamed}`
      }).check();

      await page.getByRole('button', {
        name: 'Delete selected columns'
      }).click();

      await confirmDeletion(page, 'Delete columns');

      // Verify deletion through the Columns manager.
      await page.getByRole('button', {
        name: 'Columns'
      }).click();

      const manager = page.getByRole('dialog', {
        name: 'Manage courses'
      });

      await expect(
        manager.getByRole('checkbox', {
          name: `Select ${course}`,
          exact: true
        })
      ).toHaveCount(0);

      await expect(
        manager.getByRole('checkbox', {
          name: `Select ${renamed}`,
          exact: true
        })
      ).toHaveCount(0);

      await manager.getByRole('button', {
        name: 'Close'
      }).click();

    } finally {
      if (
        (
          await page.locator('.section-overview h2')
            .textContent()
            .catch(() => null)
        )?.trim() === section
      ) {
        await deleteSection(page, section);
      }
    }

    // Sign out and verify the login screen.
    await page.getByRole('button', {
      name: 'Sign out'
    }).click();

    await expect(
      page.getByRole('heading', {
        name: 'Welcome back'
      })
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole('heading', {
        name: 'Welcome back'
      })
    ).toBeVisible();
  }
);

// ============================================================
// TEST 2: MOBILE RESPONSIVENESS AND RECORD MANAGEMENT
// ============================================================

test(
  'real mobile browser: image-backed login, navigation, add/edit and no horizontal viewport overflow',
  async ({ page }) => {
    await page.setViewportSize({
      width: 390,
      height: 844
    });

    await page.goto('/');

    await expect(
      page.locator('.auth-showcase')
    ).toBeVisible();

    await expect(
      page.locator('.brainserve-mark').first()
    ).toBeVisible();

    await login(page);

    // Verify the mobile navigation menu.
    await expect(
      page.getByRole('button', {
        name: 'Open menu'
      })
    ).toBeVisible();

    await page.getByRole('button', {
      name: 'Open menu'
    }).click();

    await expect(
      page.getByRole('button', {
        name: 'Close menu'
      })
    ).toBeVisible();

    await page.getByRole('button', {
      name: 'Close menu'
    }).click();

    const section = makeName('Mobile E2E');

    try {
      await makeSection(page, section);

      await addColumn(page, 'Mobile Course');

      await addRecord(
        page,
        'Mobile Institute',
        'Mobile Course',
        '30.00'
      );

      // Confirm the page does not overflow horizontally.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth >
        window.innerWidth + 2
      );

      expect(overflow).toBe(false);

      await page.screenshot({
        path: 'test-results/mobile-directory.png',
        fullPage: true
      });

    } finally {
      if (
        (
          await page.locator('.section-overview h2')
            .textContent()
            .catch(() => null)
        )?.trim() === section
      ) {
        await deleteSection(page, section);
      }
    }
  }
);

// ============================================================
// TEST 3: PAGINATION, FILTERING, SELECTION AND CSV EXPORT
// ============================================================

test(
  'real browser: table pagination, page selection, filtering, sorting and preserved exports',
  async ({ page }) => {
    test.setTimeout(105000);

    const section = makeName('Paging E2E');

    await login(page);

    try {
      await makeSection(page, section);
      await addColumn(page, 'Pagination Amount');

      // FIX: Display 25 rows while creating the 12 test records.
      // Previously, record 11 was hidden on page 2, which caused
      // the shared addRecord() visibility assertion to fail.

      await page.getByRole('combobox', {
        name: 'Rows per page'
      }).selectOption('25');

      // Create 12 institutions.
      for (let index = 1; index <= 12; index++) {
        await addRecord(
          page,
          `Page Institute ${String(index).padStart(2, '0')}`,
          'Pagination Amount',
          String(index)
        );
      }

      // All 12 records should be visible at page size 25.
      await expect(
        page.locator('.matrix-table tbody tr')
      ).toHaveCount(12);

      // Restore 10 rows per page for pagination testing.
      await page.getByRole('combobox', {
        name: 'Rows per page'
      }).selectOption('10');

      // Verify pagination.
      await expect(
        page.getByText('Page 1 of 2')
      ).toBeVisible();

      await expect(
        page.locator('.matrix-table tbody tr')
      ).toHaveCount(10);

      // Navigate to page 2.
      await page.getByRole('button', {
        name: 'Next page'
      }).click();

      await expect(
        page.getByText('Page 2 of 2')
      ).toBeVisible();

      await expect(
        page.locator('.matrix-table tbody tr')
      ).toHaveCount(2);

      await expect(
        page.locator('.number-col').last()
      ).toHaveText('12');

      // Select only records visible on page 2.
      await page.getByRole('checkbox', {
        name: 'Select all records on this page'
      }).check();

      await expect(
        page.getByText('2 selected')
      ).toBeVisible();

      // Navigate back to page 1.
      await page.getByRole('button', {
        name: 'First page'
      }).click();

      await expect(
        page.getByRole('checkbox', {
          name: 'Select all records on this page'
        })
      ).not.toBeChecked();

      await page.getByRole('button', {
        name: 'Deselect'
      }).click();

      // Verify page-size options.
      await page.getByRole('combobox', {
        name: 'Rows per page'
      }).selectOption('25');

      await expect(
        page.getByText('Page 1 of 1')
      ).toBeVisible();

      await expect(
        page.locator('.matrix-table tbody tr')
      ).toHaveCount(12);

      // Switch back to 10 rows per page.
      await page.getByRole('combobox', {
        name: 'Rows per page'
      }).selectOption('10');

      await page.getByRole('button', {
        name: 'Last page'
      }).click();

      // Verify searching filters the table.
      await page.getByRole('textbox', {
        name: 'Search records'
      }).fill('Page Institute 01');

      await expect(
        page.getByText('Page 1 of 1')
      ).toBeVisible();

      await expect(
        page.locator('.matrix-table tbody tr')
      ).toHaveCount(1);

      // Clear the filter.
      await page.getByRole('textbox', {
        name: 'Search records'
      }).fill('');

      // Verify CSV export contains all 12 records.
      const downloaded = page.waitForEvent('download');

      await page.getByRole('button', {
        name: 'More actions'
      }).click();

      await page.getByRole('button', {
        name: 'Export CSV'
      }).click();

      const csv = await downloaded;

      const fs = await import('node:fs/promises');

      const content = await fs.readFile(
        await csv.path(),
        'utf8'
      );

      expect(content).toContain('Page Institute 01');
      expect(content).toContain('Page Institute 12');

    } finally {
      // Clean up the test section.
      if (
        (
          await page.locator('.section-overview h2')
            .textContent()
            .catch(() => null)
        )?.trim() === section
      ) {
        await deleteSection(page, section);
      }
    }
  }
);
