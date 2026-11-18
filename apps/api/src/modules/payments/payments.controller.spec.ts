import { PaymentsController } from './payments.controller';

function render(status: string) {
  const res = { status: jest.fn().mockReturnThis(), setHeader: jest.fn().mockReturnThis(), send: jest.fn() };
  new PaymentsController({} as never).returnPage(status, res as never);
  return { res, html: res.send.mock.calls[0][0] as string };
}

describe('PaymentsController return page (after Stripe Checkout)', () => {
  it('thanks the contact in English after paying', () => {
    const { res, html } = render('success');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Thank you for your payment!');
  });

  it('says nothing was charged when the checkout was cancelled', () => {
    const { html } = render('cancel');
    expect(html).toContain('Payment cancelled');
    expect(html).toContain('You have not been charged.');
  });
});
