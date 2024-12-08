"use server";

export function logMessage(formData: FormData) {
  console.log(formData.get("message"));
}
