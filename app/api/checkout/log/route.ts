import { NextRequest, NextResponse } from 'next/server';

type CheckoutLogPayload = {
  status: 'SUCCESS' | 'FAILURE' | string;
  page?: string | null;
  pageUrl?: string | null;
  txHash?: string | null;
  orderId?: string | number | null;
  message?: string | null;
  timestamp?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutLogPayload;
    const {
      status = 'SUCCESS',
      page = null,
      pageUrl = null,
      txHash = null,
      orderId = null,
      message = null,
      timestamp = new Date().toISOString(),
    } = body || {};

    const logEntry = {
      source: 'checkout',
      status,
      page,
      pageUrl,
      txHash,
      orderId,
      message,
      timestamp,
      ip:
        req.headers.get('x-forwarded-for') ??
        req.headers.get('x-real-ip') ??
        null,
      ua: req.headers.get('user-agent') ?? null,
    };

    if (String(status).toUpperCase() === 'SUCCESS') {
      // eslint-disable-next-line no-console
      console.log('✅ [CHECKOUT][SUCCESS]', logEntry);
    } else {
      // eslint-disable-next-line no-console
      console.error('❌ [CHECKOUT][FAILURE]', logEntry);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('❌ [CHECKOUT][LOG_ERROR]', error?.message || error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unknown error' },
      { status: 400 },
    );
  }
}


