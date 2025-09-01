export const toLocale = (date) => {
    return date ? new Date(date).toLocaleString() : "-";
}