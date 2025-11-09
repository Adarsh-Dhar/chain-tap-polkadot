export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  console.error("🧪 ========== TEST LOG ENDPOINT CALLED ==========")
  console.error("If you see this in your terminal, logging is working!")
  console.error("Timestamp:", new Date().toISOString())
  console.error("================================================")
  
  return Response.json({ 
    message: "Check your server terminal for logs!",
    timestamp: new Date().toISOString()
  })
}

