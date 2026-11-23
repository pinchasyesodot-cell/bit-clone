import axios from "axios";
import { config } from "../config/env.js";

export const api = axios.create({
    baseURL: config.URL_ACCOUNTS,
    timeout: 5000,
    headers: { "x-internal-key": config.INTERNAL_API_KEY },
});
