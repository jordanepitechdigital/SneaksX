#!/bin/bash

# SneaksX Testing Orchestration Script
# This script coordinates the execution of all test suites

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$PROJECT_ROOT/tests"
RESULTS_DIR="$PROJECT_ROOT/test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test execution tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SneaksX Testing Orchestration v1.0   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Function to run a test suite
run_test() {
    local test_name=$1
    local test_command=$2
    local test_type=$3

    echo -e "${YELLOW}Running: ${test_name}${NC}"
    TESTS_RUN=$((TESTS_RUN + 1))

    # Run the test and capture output
    if eval "$test_command" > "$RESULTS_DIR/${test_type}_${TIMESTAMP}.log" 2>&1; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "  Check logs at: $RESULTS_DIR/${test_type}_${TIMESTAMP}.log"
        return 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js is not installed${NC}"
        exit 1
    fi

    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}✗ npm is not installed${NC}"
        exit 1
    fi

    # Check if development server is running
    if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Development server not running on port 3000${NC}"
        echo "Starting development server..."

        # Start dev server in background
        cd "$PROJECT_ROOT"
        npm run dev > "$RESULTS_DIR/dev_server_${TIMESTAMP}.log" 2>&1 &
        DEV_SERVER_PID=$!

        # Wait for server to start
        echo "Waiting for server to start..."
        sleep 10

        # Check again
        if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${RED}✗ Failed to start development server${NC}"
            exit 1
        fi

        echo -e "${GREEN}✓ Development server started (PID: $DEV_SERVER_PID)${NC}"
    else
        echo -e "${GREEN}✓ Development server is running${NC}"
    fi

    # Check environment variables
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
        echo -e "${YELLOW}⚠ Supabase environment variables not set${NC}"
        echo "Loading from .env.local..."

        if [ -f "$PROJECT_ROOT/.env.local" ]; then
            export $(cat "$PROJECT_ROOT/.env.local" | grep -v '^#' | xargs)
            echo -e "${GREEN}✓ Environment variables loaded${NC}"
        else
            echo -e "${RED}✗ .env.local file not found${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Environment variables configured${NC}"
    fi

    echo ""
}

# Function to install test dependencies
install_dependencies() {
    echo -e "${BLUE}Installing test dependencies...${NC}"

    cd "$PROJECT_ROOT"

    # Check if Playwright is installed
    if ! npm list @playwright/test > /dev/null 2>&1; then
        echo "Installing Playwright..."
        npm install --save-dev @playwright/test
        npx playwright install
    fi

    # Check if Jest is installed
    if ! npm list jest > /dev/null 2>&1; then
        echo "Installing Jest and React Testing Library..."
        npm install --save-dev jest @testing-library/react @testing-library/jest-dom
    fi

    echo -e "${GREEN}✓ Test dependencies ready${NC}"
    echo ""
}

# Main test execution
main() {
    echo "Test Execution Started: $(date)"
    echo "================================"
    echo ""

    # Check prerequisites
    check_prerequisites

    # Ask for test mode
    echo -e "${BLUE}Select test mode:${NC}"
    echo "1) Quick validation (database + API tests only)"
    echo "2) Full test suite (all tests including E2E)"
    echo "3) Manual testing checklist"
    echo "4) Custom test selection"
    read -p "Enter choice [1-4]: " choice

    case $choice in
        1)
            echo -e "\n${BLUE}Running Quick Validation Suite${NC}\n"

            # Run database tests
            run_test "Database Connectivity Tests" \
                "cd '$PROJECT_ROOT' && npx tsx tests/quick-test-runner.ts" \
                "database" || true

            # Run API tests
            run_test "API Endpoint Tests" \
                "curl -s http://localhost:3000/api/kicks/monitor/health" \
                "api_health" || true
            ;;

        2)
            echo -e "\n${BLUE}Running Full Test Suite${NC}\n"

            # Install dependencies if needed
            install_dependencies

            # Run all test suites
            run_test "Database & Integration Tests" \
                "cd '$PROJECT_ROOT' && npx tsx tests/quick-test-runner.ts" \
                "integration" || true

            run_test "E2E Critical Path Tests" \
                "cd '$PROJECT_ROOT' && npx playwright test tests/e2e-critical-paths.spec.ts --reporter=json" \
                "e2e" || true

            # Performance tests
            echo -e "${YELLOW}Running Performance Tests...${NC}"
            run_test "Performance Metrics" \
                "cd '$PROJECT_ROOT' && npx lighthouse http://localhost:3000 --output=json --output-path='$RESULTS_DIR/lighthouse_${TIMESTAMP}.json' --chrome-flags='--headless'" \
                "performance" || true
            ;;

        3)
            echo -e "\n${BLUE}Opening Manual Testing Checklist${NC}\n"
            echo "Manual testing checklist available at:"
            echo "$TESTS_DIR/manual-validation.md"

            # Open in default editor if available
            if command -v code &> /dev/null; then
                code "$TESTS_DIR/manual-validation.md"
            elif command -v open &> /dev/null; then
                open "$TESTS_DIR/manual-validation.md"
            else
                cat "$TESTS_DIR/manual-validation.md"
            fi
            ;;

        4)
            echo -e "\n${BLUE}Custom Test Selection${NC}\n"
            echo "Available test suites:"
            echo "1) Database connectivity"
            echo "2) API endpoints"
            echo "3) E2E authentication"
            echo "4) E2E shopping cart"
            echo "5) Real-time features"
            echo "6) Performance metrics"

            read -p "Enter test numbers to run (comma-separated): " selections

            IFS=',' read -ra SELECTED <<< "$selections"
            for selection in "${SELECTED[@]}"; do
                case $selection in
                    1) run_test "Database Tests" "cd '$PROJECT_ROOT' && npx tsx tests/quick-test-runner.ts" "database" || true ;;
                    2) run_test "API Tests" "curl -s http://localhost:3000/api/kicks/monitor/health" "api" || true ;;
                    3) run_test "Auth E2E" "cd '$PROJECT_ROOT' && npx playwright test tests/e2e-critical-paths.spec.ts -g 'Authentication'" "auth_e2e" || true ;;
                    4) run_test "Cart E2E" "cd '$PROJECT_ROOT' && npx playwright test tests/e2e-critical-paths.spec.ts -g 'Shopping Cart'" "cart_e2e" || true ;;
                    5) run_test "Real-time Tests" "cd '$PROJECT_ROOT' && npx playwright test tests/e2e-critical-paths.spec.ts -g 'Real-time'" "realtime" || true ;;
                    6) run_test "Performance" "cd '$PROJECT_ROOT' && npx lighthouse http://localhost:3000 --output=json --chrome-flags='--headless'" "perf" || true ;;
                    *) echo -e "${RED}Invalid selection: $selection${NC}" ;;
                esac
            done
            ;;

        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac

    echo ""
    echo "================================"
    echo -e "${BLUE}Test Execution Summary${NC}"
    echo "================================"
    echo "Tests Run: $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

    if [ $TESTS_RUN -gt 0 ]; then
        PASS_RATE=$((TESTS_PASSED * 100 / TESTS_RUN))
        echo "Pass Rate: $PASS_RATE%"
    fi

    echo ""
    echo "Test results saved to: $RESULTS_DIR"
    echo "Timestamp: $TIMESTAMP"

    # Generate summary report
    cat > "$RESULTS_DIR/summary_${TIMESTAMP}.txt" <<EOF
SneaksX Test Execution Summary
==============================
Date: $(date)
Tests Run: $TESTS_RUN
Tests Passed: $TESTS_PASSED
Tests Failed: $TESTS_FAILED
Pass Rate: ${PASS_RATE}%

Test Logs:
$(ls -la "$RESULTS_DIR"/*_${TIMESTAMP}.* 2>/dev/null || echo "No logs generated")
EOF

    echo ""
    echo -e "${GREEN}Summary report saved to: $RESULTS_DIR/summary_${TIMESTAMP}.txt${NC}"

    # Cleanup: Kill dev server if we started it
    if [ ! -z "$DEV_SERVER_PID" ]; then
        echo ""
        echo "Stopping development server..."
        kill $DEV_SERVER_PID 2>/dev/null || true
    fi

    # Exit with appropriate code
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Trap to ensure cleanup on exit
trap 'if [ ! -z "$DEV_SERVER_PID" ]; then kill $DEV_SERVER_PID 2>/dev/null || true; fi' EXIT

# Run main function
main