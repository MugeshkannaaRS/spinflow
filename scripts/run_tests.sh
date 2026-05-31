#!/bin/bash
echo "=== SpinFlow ERP Test Suite ==="
echo ""

echo "--- Backend Tests ---"
cd backend && python -m pytest tests/ -v --tb=short 2>&1
BACKEND_EXIT=$?
cd ..

echo ""
echo "--- Frontend Build Check ---"
npm run build 2>&1
BUILD_EXIT=$?

echo ""
echo "--- Frontend Type Check ---"
npx tsc --noEmit 2>&1
TYPE_EXIT=$?

echo ""
echo "=== RESULTS ==="
[ $BACKEND_EXIT -eq 0 ] && echo "✅ Backend tests: PASS" || echo "❌ Backend tests: FAIL"
[ $BUILD_EXIT -eq 0 ] && echo "✅ Frontend build: PASS" || echo "❌ Frontend build: FAIL"
[ $TYPE_EXIT -eq 0 ] && echo "✅ TypeScript: PASS" || echo "❌ TypeScript: FAIL"

if [ $BACKEND_EXIT -eq 0 ] && [ $BUILD_EXIT -eq 0 ] && [ $TYPE_EXIT -eq 0 ]; then
  echo ""
  echo "✅ ALL PASSED — safe to deploy"
else
  echo ""
  echo "❌ FAILURES FOUND — do not deploy"
fi
