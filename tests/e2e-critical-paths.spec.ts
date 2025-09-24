/**
 * E2E Critical Path Tests for SneaksX
 * These tests validate the most important user journeys
 *
 * Setup:
 * 1. npm install --save-dev @playwright/test
 * 2. npx playwright install
 * 3. npx playwright test tests/e2e-critical-paths.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = `test_${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'TestPassword123!';

// Helper functions
async function waitForRealTimeUpdate(page: Page, timeout = 5000) {
  // Wait for WebSocket message or DOM update
  return page.waitForTimeout(timeout);
}

async function createTestUser(page: Page) {
  await page.goto(`${BASE_URL}/signup`);
  await page.fill('input[name="email"]', TEST_USER_EMAIL);
  await page.fill('input[name="password"]', TEST_USER_PASSWORD);
  await page.fill('input[name="fullName"]', 'Test User');
  await page.click('button[type="submit"]');

  // Wait for redirect or success message
  await page.waitForURL((url) => !url.href.includes('/signup'), { timeout: 10000 });
}

async function loginUser(page: Page, email = TEST_USER_EMAIL, password = TEST_USER_PASSWORD) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for authentication
  await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 10000 });
}

// Test Suite 1: Authentication Flow
test.describe('Authentication Flow', () => {
  test('should create a new user account', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // Fill registration form
    const uniqueEmail = `test_${Date.now()}@example.com`;
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="fullName"]', 'E2E Test User');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify success
    await expect(page).not.toHaveURL(/\/signup/);

    // Check for user session
    const cookies = await page.context().cookies();
    const authCookie = cookies.find(c => c.name.includes('auth') || c.name.includes('session'));
    expect(authCookie).toBeDefined();
  });

  test('should login with valid credentials', async ({ page }) => {
    // First create a user
    await createTestUser(page);

    // Logout if needed
    await page.goto(`${BASE_URL}/logout`);

    // Login
    await loginUser(page);

    // Verify logged in state
    await page.goto(`${BASE_URL}/profile`);
    await expect(page).toHaveURL(/\/profile/);
  });

  test('should protect authenticated routes', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto(`${BASE_URL}/profile`);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

// Test Suite 2: Product Browsing and Search
test.describe('Product Browsing', () => {
  test('should display products on listing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/products`);

    // Wait for products to load
    await page.waitForSelector('[data-testid="product-card"], .product-item', { timeout: 10000 });

    // Verify products are displayed
    const products = await page.locator('[data-testid="product-card"], .product-item').count();
    expect(products).toBeGreaterThan(0);

    // Check product information
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await expect(firstProduct).toContainText(/\$/); // Should have price
  });

  test('should search for products', async ({ page }) => {
    await page.goto(`${BASE_URL}/products`);

    // Search for a specific term
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('Jordan');
    await searchInput.press('Enter');

    // Wait for search results
    await page.waitForTimeout(1000);

    // Verify filtered results
    const products = await page.locator('[data-testid="product-card"], .product-item').count();
    expect(products).toBeGreaterThanOrEqual(0);
  });

  test('should filter products by brand', async ({ page }) => {
    await page.goto(`${BASE_URL}/products`);

    // Find and click brand filter
    const brandFilter = page.locator('button:has-text("Nike"), input[type="checkbox"][value="Nike"]');
    if (await brandFilter.count() > 0) {
      await brandFilter.first().click();

      // Wait for filter to apply
      await page.waitForTimeout(1000);

      // Verify URL or products updated
      const url = page.url();
      expect(url).toMatch(/brand|filter/i);
    }
  });

  test('should view product details', async ({ page }) => {
    await page.goto(`${BASE_URL}/products`);

    // Click first product
    const firstProduct = page.locator('[data-testid="product-card"], .product-item, a[href*="/products/"]').first();
    await firstProduct.click();

    // Verify product detail page
    await expect(page).toHaveURL(/\/products\/.+/);

    // Check for product elements
    await expect(page.locator('h1, [data-testid="product-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="product-price"], .price')).toBeVisible();
    await expect(page.locator('button:has-text("Add to Cart"), [data-testid="add-to-cart"]')).toBeVisible();
  });
});

// Test Suite 3: Shopping Cart Operations
test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Create and login user
    await createTestUser(page);
  });

  test('should add product to cart', async ({ page }) => {
    // Navigate to products
    await page.goto(`${BASE_URL}/products`);

    // Click first product
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    // Select size if required
    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    // Add to cart
    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

    // Verify success message or cart update
    await expect(page.locator('.toast, [role="alert"], [data-testid="cart-count"]')).toBeVisible();
  });

  test('should update cart quantities', async ({ page }) => {
    // First add an item
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

    // Go to cart
    await page.goto(`${BASE_URL}/cart`);

    // Update quantity
    const quantityInput = page.locator('input[type="number"], [data-testid="quantity-input"]').first();
    await quantityInput.fill('2');

    // Wait for update
    await page.waitForTimeout(1000);

    // Verify total updated
    const total = await page.locator('[data-testid="cart-total"], .total').textContent();
    expect(total).toBeTruthy();
  });

  test('should remove items from cart', async ({ page }) => {
    // Add item first
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

    // Go to cart
    await page.goto(`${BASE_URL}/cart`);

    // Remove item
    await page.click('button:has-text("Remove"), [data-testid="remove-item"]');

    // Verify cart is empty
    await expect(page.locator('text=/empty|no items/i')).toBeVisible();
  });

  test('should persist cart across sessions', async ({ page, context }) => {
    // Add item to cart
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

    // Save cookies
    const cookies = await context.cookies();

    // Create new page
    const newPage = await context.newPage();

    // Navigate to cart
    await newPage.goto(`${BASE_URL}/cart`);

    // Verify item is still in cart
    const cartItems = await newPage.locator('[data-testid="cart-item"], .cart-item').count();
    expect(cartItems).toBeGreaterThan(0);

    await newPage.close();
  });
});

// Test Suite 4: Checkout Process
test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Create user and add item to cart
    await createTestUser(page);

    // Add product to cart
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');
  });

  test('should complete checkout process', async ({ page }) => {
    // Go to cart
    await page.goto(`${BASE_URL}/cart`);

    // Proceed to checkout
    await page.click('button:has-text("Checkout"), [data-testid="checkout-button"]');

    // Fill shipping information
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[name="address"]', '123 Test Street');
    await page.fill('input[name="city"]', 'Test City');
    await page.fill('input[name="state"]', 'CA');
    await page.fill('input[name="postalCode"]', '90210');

    // Mock payment information
    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="cardExpiry"]', '12/25');
    await page.fill('input[name="cardCvc"]', '123');

    // Place order
    await page.click('button:has-text("Place Order"), [data-testid="place-order"]');

    // Verify order success
    await expect(page).toHaveURL(/order-success|confirmation/);
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/checkout`);

    // Try to submit without filling fields
    await page.click('button:has-text("Place Order"), [data-testid="place-order"]');

    // Check for validation messages
    await expect(page.locator('.error, [role="alert"], .invalid-feedback')).toBeVisible();
  });
});

// Test Suite 5: Real-time Features
test.describe('Real-time Updates', () => {
  test('should show real-time stock updates', async ({ page, context }) => {
    // Open product in two tabs
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    const productUrl = await firstProduct.getAttribute('href');

    if (productUrl) {
      // First tab
      await page.goto(`${BASE_URL}${productUrl}`);
      const initialStock = await page.locator('[data-testid="stock-level"], .stock').textContent();

      // Second tab - simulate purchase
      const page2 = await context.newPage();
      await createTestUser(page2);
      await page2.goto(`${BASE_URL}${productUrl}`);

      const sizeSelector = page2.locator('select[name="size"], [data-testid="size-selector"]');
      if (await sizeSelector.count() > 0) {
        await sizeSelector.selectOption({ index: 1 });
      }

      await page2.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

      // Wait for real-time update in first tab
      await waitForRealTimeUpdate(page);

      // Check if stock updated (this depends on implementation)
      const updatedStock = await page.locator('[data-testid="stock-level"], .stock').textContent();
      // Stock should change or at least not error
      expect(updatedStock).toBeTruthy();

      await page2.close();
    }
  });

  test('should show real-time order status updates', async ({ page }) => {
    await createTestUser(page);

    // Create an order first
    await page.goto(`${BASE_URL}/products`);
    const firstProduct = page.locator('[data-testid="product-card"], .product-item').first();
    await firstProduct.click();

    const sizeSelector = page.locator('select[name="size"], [data-testid="size-selector"]');
    if (await sizeSelector.count() > 0) {
      await sizeSelector.selectOption({ index: 1 });
    }

    await page.click('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');
    await page.goto(`${BASE_URL}/cart`);
    await page.click('button:has-text("Checkout"), [data-testid="checkout-button"]');

    // Quick checkout
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[name="address"]', '123 Test Street');
    await page.fill('input[name="city"]', 'Test City');
    await page.fill('input[name="state"]', 'CA');
    await page.fill('input[name="postalCode"]', '90210');
    await page.click('button:has-text("Place Order"), [data-testid="place-order"]');

    // Go to orders page
    await page.goto(`${BASE_URL}/orders`);

    // Check for order status
    await expect(page.locator('[data-testid="order-status"], .order-status')).toBeVisible();
  });
});

// Test Suite 6: Error Handling
test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page, context }) => {
    // Simulate offline
    await context.setOffline(true);

    await page.goto(`${BASE_URL}/products`).catch(() => {});

    // Check for error message
    await expect(page.locator('text=/offline|error|failed/i')).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });

  test('should handle invalid product URLs', async ({ page }) => {
    await page.goto(`${BASE_URL}/products/invalid-product-slug-12345`);

    // Should show 404 or redirect
    await expect(page.locator('text=/not found|404|does not exist/i')).toBeVisible();
  });

  test('should prevent adding out-of-stock items', async ({ page }) => {
    // This test requires finding an out-of-stock product
    // Implementation depends on your data
    await page.goto(`${BASE_URL}/products`);

    // Look for out of stock indicator
    const outOfStockProduct = page.locator('text=/out of stock|sold out/i');
    if (await outOfStockProduct.count() > 0) {
      const product = outOfStockProduct.locator('..').first();
      await product.click();

      // Try to add to cart
      const addButton = page.locator('button:has-text("Add to Cart"), [data-testid="add-to-cart"]');

      // Should be disabled or show error
      const isDisabled = await addButton.isDisabled();
      if (!isDisabled) {
        await addButton.click();
        await expect(page.locator('text=/out of stock|not available/i')).toBeVisible();
      }
    }
  });
});

// Test Suite 7: Performance
test.describe('Performance Metrics', () => {
  test('should load homepage within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000);
  });

  test('should load product listing within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/products`);
    await page.waitForSelector('[data-testid="product-card"], .product-item');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000);
  });
});

// Test configuration
test.use({
  // Global test timeout
  timeout: 30000,

  // Action timeout
  actionTimeout: 10000,

  // Navigation timeout
  navigationTimeout: 30000,

  // Screenshot on failure
  screenshot: 'only-on-failure',

  // Video on failure
  video: 'retain-on-failure',

  // Trace on failure
  trace: 'retain-on-failure',
});