import { dispatchPaymentRequest } from "./handlers";
export const config = { api: { bodyParser: false } };
export default (req: any, res: any) => dispatchPaymentRequest(req, res, true);
