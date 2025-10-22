export const config = { runtime: "edge" };

export default async function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Anis Edge handshake success (super fast)",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
