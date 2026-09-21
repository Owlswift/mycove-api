import { WhatsappClient } from './whatsapp-client';
import { WhatsappNotifier } from './whatsapp-notifier';

const ENV = { ...process.env };

function setup(users: { id: string; phone: string; fullName: string; estate: { name: string } }[] = []) {
  const findMany = jest.fn().mockResolvedValue(users);
  const prisma = { user: { findMany } } as never;
  const client = new WhatsappClient();
  const sendTemplate = jest.spyOn(client, 'sendTemplate').mockResolvedValue(true);
  return { notifier: new WhatsappNotifier(prisma, client), findMany, sendTemplate };
}

afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('WhatsappNotifier', () => {
  const tina = { id: 'u1', phone: '+2348030000001', fullName: 'Tina Obi', estate: { name: 'Palm Court Estate' } };

  it('sends nothing when WhatsApp itself is not configured', async () => {
    process.env.WHATSAPP_TEMPLATES = '{"visitor_arrived":"visitor_arrived"}';
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { notifier, sendTemplate } = setup([tina]);
    await notifier.toUser('u1', 'visitor_arrived', ['x']);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('sends nothing for an event with no template, so push stays the only channel', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_TEMPLATES = '{"visitor_arrived":"visitor_arrived"}';
    const { notifier, sendTemplate, findMany } = setup([tina]);
    await notifier.toUser('u1', 'dues_reminder', ['x']);
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('a broken WHATSAPP_TEMPLATES value disables templates instead of throwing', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_TEMPLATES = '{oops';
    const { notifier, sendTemplate } = setup([tina]);
    await expect(notifier.toUser('u1', 'visitor_arrived', ['x'])).resolves.toBeUndefined();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('with a template set, sends it with the recipient-specific variables and skips opted-out residents', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_TEMPLATES = '{"visitor_arrived":"visitor_arrived"}';
    const { notifier, sendTemplate, findMany } = setup([tina]);
    await notifier.toUser('u1', 'visitor_arrived', (r) => [r.firstName, 'Mr Adeyemi', r.estateName]);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ whatsappOptOut: false });
    expect(sendTemplate).toHaveBeenCalledWith('+2348030000001', 'visitor_arrived', 'en', ['Tina', 'Mr Adeyemi', 'Palm Court Estate']);
  });

  it('cleans variables: no line breaks, never empty', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_TEMPLATES = '{"estate_notice":"estate_notice"}';
    const { notifier, sendTemplate } = setup([tina]);
    await notifier.toUsers(['u1'], 'estate_notice', ['Tina', '', 'Line one\nLine two']);
    expect(sendTemplate).toHaveBeenCalledWith(tina.phone, 'estate_notice', 'en', ['Tina', '-', 'Line one Line two']);
  });

  it('the password code goes to the phone with the Copy code button value', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_TEMPLATES = '{"password_reset":"mycove_password_reset_code"}';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'en_US';
    const { notifier, sendTemplate } = setup();
    await notifier.toPhone('+2348030000001', 'password_reset', ['482915'], '482915');
    expect(sendTemplate).toHaveBeenCalledWith('+2348030000001', 'mycove_password_reset_code', 'en_US', ['482915'], '482915');
  });
});

describe('WhatsappClient.sendTemplate', () => {
  it('posts a template with body variables and the code button', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => '' } as Response);
    const ok = await new WhatsappClient().sendTemplate('+2348030000001', 'mycove_password_reset_code', 'en', ['482915'], '482915');
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/999/messages');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '2348030000001', type: 'template' });
    expect(body.template.name).toBe('mycove_password_reset_code');
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '482915' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482915' }] },
    ]);
  });
});
