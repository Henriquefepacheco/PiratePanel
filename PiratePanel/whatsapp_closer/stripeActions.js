/**
 * stripeActions.js — Integração Stripe do The Closer
 * Permite que o bot crie cupons únicos por lead em tempo real.
 */
require('dotenv').config({ path: '../../.env' });
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Cria um cupom único no Stripe para um lead específico.
 * @param {string} leadHandle - Handle do Instagram do lead (ex: dra_carla_odonto)
 * @param {number} percentOff - Percentual de desconto (ex: 20 para 20%)
 * @param {number} durationInMonths - Duração em meses (null = 'once' para apenas 1 cobrança)
 * @returns {{ couponCode: string, percentOff: number, url: string } | null}
 */
async function createLeadCoupon(leadHandle, percentOff = 20, durationInMonths = null) {
    try {
        // Cria um código único baseado no handle e timestamp para rastreabilidade
        const sanitizedHandle = leadHandle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 10);
        const uniqueCode = `VIP${sanitizedHandle}${Date.now().toString(36).toUpperCase().slice(-4)}`;

        const couponParams = {
            id: uniqueCode,
            name: `Desconto VIP — @${leadHandle}`,
            percent_off: percentOff,
            duration: durationInMonths ? 'repeating' : 'once',
            ...(durationInMonths && { duration_in_months: durationInMonths }),
            redeem_by: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // Expira em exatas 24 horas
            max_redemptions: 1, // Cupom exclusivo — só pode ser usado 1 vez
            metadata: {
                lead_handle: leadHandle,
                created_by: 'TheCloser',
                channel: 'whatsapp',
            }
        };

        const coupon = await stripe.coupons.create(couponParams);
        console.log(`✅ Cupom criado no Stripe: ${coupon.id} (${percentOff}% OFF) para @${leadHandle}`);

        return {
            couponCode: coupon.id,
            percentOff: coupon.percent_off,
            checkoutUrl: `https://hubica.com.br/`
        };
    } catch (err) {
        console.error(`❌ Erro ao criar cupom Stripe:`, err.message);
        return null;
    }
}

/**
 * Verifica se um cupom já existe para este lead (evita duplicatas)
 * @param {string} leadHandle 
 */
async function checkExistingCoupon(leadHandle) {
    try {
        const sanitizedHandle = leadHandle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 10);
        // Busca cupons com o handle do lead no nome
        const coupons = await stripe.coupons.list({ limit: 100 });
        return coupons.data.find(c =>
            c.metadata?.lead_handle === leadHandle &&
            c.valid === true
        ) || null;
    } catch (err) {
        return null;
    }
}

module.exports = { createLeadCoupon, checkExistingCoupon };
