export function useRequestHandler() {
  const handleRequest = async <T>(
    requestFn: () => Promise<T>,
    successCallback?: (res: T) => void,
    errorCallback?: (error: any) => void,
  ): Promise<null | T> => {
    try {
      const result: T = await requestFn();
      successCallback && successCallback(result);
      return result;
    } catch (error: any) {
      errorCallback && errorCallback(error);
      return null;
    }
  };

  return { handleRequest };
}
