#!/usr/bin/env python3
"""Fix remaining test calls that are missing the assetType parameter."""

import re

with open('/Users/ekf/Downloads/Projects/Polka Agent/aegis protocol/contracts/test/AegisVault.test.js', 'r') as f:
    content = f.read()

# Pattern to find routeYieldViaXCM calls that are missing assetType
# These are calls with exactly 7 arguments (missing the 8th assetType)
# We need to add assetType (0 for Native, 1 for Wrapped) as the last parameter

# Find all routeYieldViaXCM calls and add assetType if missing
# Pattern: routeYieldViaXCM(\n          arg1,\n          arg2,\n          ...\n          arg7\n        )
# Should become: routeYieldViaXCM(\n          arg1,\n          arg2,\n          ...\n          arg7,\n          0  // assetType\n        )

# Fix pattern 1: calls ending with weightLimit followed by closing paren
pattern1 = r'(routeYieldViaXCM\([^)]+weightLimit\s*\n\s*)(\))'
replacement1 = r'\1,\n          0  // assetType: Native\n        )'

# Actually, let's be more specific - look for the exact failing patterns
# Line 697 pattern
content = content.replace(
    '''aegisVault.connect(aiOracle).routeYieldViaXCM(
          destParachainId,
          tokenAddress,
          routeAmount,
          42, // Valid risk score
          assetData,
          0, // feeAssetItem
          1000000 // weightLimit
        )''',
    '''aegisVault.connect(aiOracle).routeYieldViaXCM(
          destParachainId,
          tokenAddress,
          routeAmount,
          42, // Valid risk score
          assetData,
          0, // feeAssetItem
          1000000, // weightLimit
          0  // assetType: Native
        )'''
)

# Line 782 pattern  
content = content.replace(
    '''await aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0x1234abcd5678",
          0,
          1000000
        );''',
    '''await aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0x1234abcd5678",
          0,
          1000000,
          0  // assetType: Native
        );'''
)

# Line 820 pattern
content = content.replace(
    '''await aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0x1234",
          0,
          1000000
        );''',
    '''await aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0x1234",
          0,
          1000000,
          0  // assetType: Native
        );'''
)

# Line 861 pattern
content = content.replace(
    '''aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0xabcd1234",
          1,
          500000
        )''',
    '''aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          mockToken.address,
          routeAmount,
          42,
          "0xabcd1234",
          1,
          500000,
          1  // assetType: Wrapped
        )'''
)

with open('/Users/ekf/Downloads/Projects/Polka Agent/aegis protocol/contracts/test/AegisVault.test.js', 'w') as f:
    f.write(content)

print("Fixed remaining test calls!")
