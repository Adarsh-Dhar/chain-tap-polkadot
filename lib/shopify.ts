import crypto from "crypto"

export function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string, secret: string) {
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64")
  const received = hmacHeader || ""
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received))
  } catch {
    return false
  }
}

export function getHeader(request: Request, name: string) {
  return request.headers.get(name) || ""
}


