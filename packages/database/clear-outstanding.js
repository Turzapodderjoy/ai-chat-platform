const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const bizId = 'cmt72xokj0000v29kd9jehcg9';
  const invoices = await p.invoice.findMany({ where: { businessId: bizId }, include: { items: true } });
  for (const inv of invoices) {
    const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const total = subtotal - inv.discount + inv.tax;
    if (inv.amountPaid < total) {
      await p.invoice.update({ where: { id: inv.id }, data: { amountPaid: total, status: 'paid' } });
      console.log('Fixed', inv.invoiceNumber, 'total', total);
    }
  }
  await p.$disconnect();
})();
