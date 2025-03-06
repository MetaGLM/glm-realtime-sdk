export const downloadBlobURL = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.click();
};
