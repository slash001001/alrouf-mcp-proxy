export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    message: "Anis Connector handshake successful (instant response)",
  });
}
