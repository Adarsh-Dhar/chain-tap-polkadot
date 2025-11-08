/**
 * Script to fix duplicate assetIds in product_tokens table
 * This keeps the first (oldest) product for each assetId and removes duplicates
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixDuplicates() {
  try {
    console.log('Finding duplicate assetIds...')
    
    // Find all assetIds that appear more than once
    const duplicates = await prisma.$queryRaw<Array<{ assetId: number; count: bigint }>>`
      SELECT "assetId", COUNT(*) as count
      FROM "product_tokens"
      WHERE "assetId" IS NOT NULL
      GROUP BY "assetId"
      HAVING COUNT(*) > 1
    `
    
    if (duplicates.length === 0) {
      console.log('No duplicates found!')
      return
    }
    
    console.log(`Found ${duplicates.length} duplicate assetIds:`)
    duplicates.forEach(d => {
      console.log(`  Asset ${d.assetId}: ${d.count} products`)
    })
    
    // For each duplicate, keep the oldest one and remove the rest
    for (const dup of duplicates) {
      const assetId = dup.assetId
      console.log(`\nFixing assetId ${assetId}...`)
      
      // Get all products with this assetId, ordered by creation date
      const tokens = await (prisma as any).productToken.findMany({
        where: { assetId },
        orderBy: { createdAt: 'asc' },
      })
      
      console.log(`  Found ${tokens.length} products with assetId ${assetId}:`)
      tokens.forEach((t: any, i: number) => {
        console.log(`    ${i + 1}. ${t.title} (${t.productId}) - Created: ${t.createdAt}`)
      })
      
      // Keep the first one, remove assetId from the rest
      const toKeep = tokens[0]
      const toFix = tokens.slice(1)
      
      console.log(`  Keeping: ${toKeep.title} (${toKeep.productId})`)
      
      for (const token of toFix) {
        console.log(`  Removing assetId from: ${token.title} (${token.productId})`)
        await (prisma as any).productToken.update({
          where: { id: token.id },
          data: { assetId: null },
        })
      }
    }
    
    console.log('\n✅ Duplicates fixed!')
  } catch (error) {
    console.error('Error fixing duplicates:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixDuplicates()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Failed:', error)
    process.exit(1)
  })

