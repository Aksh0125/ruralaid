export const validateE164Phone = (p: string) => /^\+[1-9]\d{7,14}$/.test(p);
export const validateFullName = (n: string) => n.length >= 2 && n.length <= 100;
// etc. for each field
