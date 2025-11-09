import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: 'model-config' } });
    if (!setting) {
      console.log('model-config not found in app_setting table.');
      return;
    }
    const value = typeof setting.value === 'object' ? setting.value : JSON.parse(String(setting.value || '{}'));
    const scoring = value?.scoring || {};
    const providers = scoring?.providers || {};
    console.log('当前评分模型配置 API Key 列表：');
    Object.entries(providers).forEach(([provider, cfg]) => {
      if (!cfg) return;
      const anyCfg = cfg as Record<string, any>;
      if ('apiKey' in anyCfg) {
        console.log(`- ${provider}: ${anyCfg.apiKey || '(未设置)'}`);
      }
    });
  } catch (err) {
    console.error('查询失败：', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
