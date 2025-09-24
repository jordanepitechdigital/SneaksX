# SneaksX Manual Testing Validation Checklist
## Quick Validation Guide for Task 2.9

### Prerequisites
- [ ] Development server running (`npm run dev`)
- [ ] Database accessible and populated
- [ ] Test user accounts created
- [ ] Browser DevTools open for monitoring

---

## 1. Authentication Testing

### User Registration
- [ ] Navigate to `/signup`
- [ ] Fill in registration form:
  - Email: `testuser_[timestamp]@example.com`
  - Password: `TestPass123!`
  - Full Name: `Test User`
- [ ] Submit form
- [ ] Verify:
  - [ ] Success message appears
  - [ ] Redirected to login or home
  - [ ] User created in database

### User Login
- [ ] Navigate to `/login`
- [ ] Enter credentials
- [ ] Verify:
  - [ ] Successful authentication
  - [ ] Session cookie set
  - [ ] User context updated
  - [ ] Redirected appropriately

### Protected Routes
- [ ] Try accessing `/profile` when logged out
- [ ] Verify redirect to login
- [ ] Login and try again
- [ ] Verify access granted

---

## 2. Product Browsing

### Product Listing
- [ ] Navigate to `/products`
- [ ] Verify:
  - [ ] Products load and display
  - [ ] Images render correctly
  - [ ] Prices show properly
  - [ ] Stock status visible

### Search Functionality
- [ ] Use search bar
- [ ] Search for "Jordan"
- [ ] Verify:
  - [ ] Results update
  - [ ] Relevant products shown
  - [ ] No results message when appropriate

### Filtering
- [ ] Apply brand filter
- [ ] Apply price range
- [ ] Verify:
  - [ ] Products filter correctly
  - [ ] URL updates with params
  - [ ] Filters can be cleared

### Product Details
- [ ] Click on a product
- [ ] Verify on `/products/[slug]`:
  - [ ] All product info displays
  - [ ] Size selector works
  - [ ] Stock levels shown
  - [ ] Add to cart button active

---

## 3. Shopping Cart

### Add to Cart
- [ ] Select a size
- [ ] Click "Add to Cart"
- [ ] Verify:
  - [ ] Success notification
  - [ ] Cart count updates
  - [ ] Item appears in cart

### Cart Management
- [ ] Navigate to `/cart`
- [ ] Verify:
  - [ ] Items display correctly
  - [ ] Prices calculate properly
  - [ ] Quantity can be updated
  - [ ] Items can be removed

### Cart Persistence
- [ ] Refresh the page
- [ ] Verify cart items remain
- [ ] Open in new tab
- [ ] Verify cart syncs

---

## 4. Checkout Flow

### Checkout Initiation
- [ ] From cart, click "Checkout"
- [ ] Verify:
  - [ ] Redirected to `/checkout`
  - [ ] Order summary shown
  - [ ] Address form displayed

### Address Entry
- [ ] Fill shipping address:
  ```
  Address: 123 Test Street
  City: Test City
  State: CA
  ZIP: 90210
  ```
- [ ] Verify form validation

### Payment Processing
- [ ] Select payment method
- [ ] Enter mock payment details
- [ ] Submit order
- [ ] Verify:
  - [ ] Processing indicator
  - [ ] Success redirect
  - [ ] Order confirmation

---

## 5. Real-time Features

### Stock Updates
- [ ] Open product in two tabs
- [ ] Add to cart in one tab
- [ ] Verify:
  - [ ] Stock updates in other tab
  - [ ] Real-time without refresh

### Price Notifications
- [ ] Monitor console for WebSocket messages
- [ ] Verify price change events received

### Order Tracking
- [ ] Navigate to `/orders`
- [ ] Verify:
  - [ ] Orders list displays
  - [ ] Status shows correctly
  - [ ] Real-time updates work

---

## 6. Inventory Management

### Stock Validation
- [ ] Try to add more than available stock
- [ ] Verify:
  - [ ] Error message shown
  - [ ] Cart limits quantity

### Reservation System
- [ ] Add item to cart
- [ ] Check database for reservation
- [ ] Wait for timeout (if applicable)
- [ ] Verify stock released

---

## 7. API Endpoints

### Test Each Endpoint
Run these commands in terminal:

```bash
# Test product API
curl http://localhost:3000/api/products

# Test cart operations
curl -X POST http://localhost:3000/api/cart \
  -H "Content-Type: application/json" \
  -d '{"productId":"[PRODUCT_ID]","size":"10","quantity":1}'

# Test order creation
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[...],"address":{...}}'
```

---

## 8. Error Handling

### Network Errors
- [ ] Disable network in DevTools
- [ ] Try various operations
- [ ] Verify:
  - [ ] Error messages display
  - [ ] App doesn't crash
  - [ ] Retry mechanisms work

### Invalid Data
- [ ] Submit forms with invalid data
- [ ] Verify:
  - [ ] Validation messages show
  - [ ] Form doesn't submit
  - [ ] No console errors

---

## 9. Performance Checks

### Page Load Times
Use DevTools Network tab:
- [ ] Home page: < 2s
- [ ] Product listing: < 2s
- [ ] Product detail: < 1.5s
- [ ] Cart page: < 1s

### API Response Times
Monitor in Network tab:
- [ ] Product fetch: < 300ms
- [ ] Cart operations: < 200ms
- [ ] Order submission: < 500ms

---

## 10. Cross-browser Testing

### Desktop Browsers
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### Mobile Devices
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] Tablet view

---

## Test Results Summary

### Pass/Fail Status

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ⬜ | |
| Product Browsing | ⬜ | |
| Shopping Cart | ⬜ | |
| Checkout | ⬜ | |
| Real-time | ⬜ | |
| Inventory | ⬜ | |
| APIs | ⬜ | |
| Error Handling | ⬜ | |
| Performance | ⬜ | |
| Cross-browser | ⬜ | |

### Critical Issues Found
1.
2.
3.

### Minor Issues
1.
2.
3.

### Recommendations
1.
2.
3.

---

## Quick SQL Validation Queries

Run these in Supabase SQL Editor:

```sql
-- Check cart items
SELECT * FROM shopping_cart
WHERE session_id = '[YOUR_SESSION_ID]';

-- Check stock levels
SELECT p.name, ps.*
FROM product_stock ps
JOIN products p ON ps.product_id = p.id
WHERE ps.quantity < 10;

-- Check recent orders
SELECT * FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- Check reservations
SELECT * FROM stock_reservations
WHERE expires_at > NOW();
```

---

## Completion Checklist

- [ ] All sections tested
- [ ] Issues documented
- [ ] Performance metrics recorded
- [ ] Screenshots taken of issues
- [ ] Database integrity verified
- [ ] Test report prepared

---

Date: _____________
Tested by: _____________
Environment: Development / Staging / Production