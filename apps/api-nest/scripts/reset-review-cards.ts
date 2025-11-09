import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.reviewLog.deleteMany({});
    await prisma.review.deleteMany({});
    // 可根据需要追加其他相关表的清理逻辑
    console.log('✅ 所有用户的复习词汇记录已清空。');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ 重置复习词汇失败：', err);
  process.exit(1);
});
