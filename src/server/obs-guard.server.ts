// Защита от перебора пароля опроса близких: отдельный счётчик, тот же механизм, что у /comm.
import { FailureLimiter } from "./comm-rate-limit";

export const obsLimiter = new FailureLimiter();
