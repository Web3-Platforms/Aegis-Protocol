#!/usr/bin/env python3
import re

# Read the test file
with open("/Users/ekf/Downloads/Projects/Polka Agent/aegis protocol/contracts/test/AegisVault.test.js", "r") as f:
    content = f.read()

# Pattern 1: Fix routeYieldViaXCM calls that are missing assetType
# Look for calls that end with weightLimit) and add assetType

# Pattern: routeYieldViaXCM(..., feeAssetItem, weightLimit)
# Should become: routeYieldViaXCM(..., feeAssetItem, weightLimit, 1)
pattern1 = r'\.routeYieldViaXCM\(([^)]+),\s*(\d+),\s*(\d+)\s*\)'
def replacer1(match):
    args = match.group(1)
    feeAssetItem = match.group(2)
    weightLimit = match.group(3)
    return f'.routeYieldViaXCM({args}, {feeAssetItem}, {weightLimit}, 1)'

content = re.sub(pattern1, replacer1, content)

# Pattern 2: Fix specific patterns that might have been missed
# These are the specific failing patterns from the test output
replacements = [
    ('routeYieldViaXCM(2000, tokenAddress, ethers.parseEther("5"), 35, assetData, feeAssetItem, weightLimit)', 
     'routeYieldViaXCM(2000, tokenAddress, ethers.parseEther("5"), 35, assetData, feeAssetItem, weightLimit, 1)'),
    ('routeYieldViaXCM(2000, await mockToken.getAddress(), ethers.parseEther("500"), 50, assetData, 0, 1000000)',
     'routeYieldViaXCM(2000, await mockToken.getAddress(), ethers.parseEther("500"), 50, assetData, 0, 1000000, 1)'),
    ('routeYieldViaXCM(1000, "0x0fe4223AD99dF788A6Dcad148eB4086E6389cEB6", ethers.parseEther("25"), 42, assetData, 0, 1000000)',
     'routeYieldViaXCM(1000, "0x0fe4223AD99dF788A6Dcad148eB4086E6389cEB6", ethers.parseEther("25"), 42, assetData, 0, 1000000, 1)'),
    ('routeYieldViaXCM(2004, "0x3C1Cb427D20F15563aDa8C249E71db76d7183B6c", ethers.parseEther("30"), 40, assetData, 0, 1000000)',
     'routeYieldViaXCM(2004, "0x3C1Cb427D20F15563aDa8C249E71db76d7183B6c", ethers.parseEther("30"), 40, assetData, 0, 1000000, 1)'),
]

for old, new in replacements:
    content = content.replace(old, new)

# Write the fixed content back
with open("/Users/ekf/Downloads/Projects/Polka Agent/aegis protocol/contracts/test/AegisVault.test.js", "w") as f:
    f.write(content)

print("Fixed test file successfully!")
