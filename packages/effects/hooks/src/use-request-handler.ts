export function useRequestHandler() {
  const handleRequest = async <T>(
    requestFn: () => Promise<T>,
    successCallback?: (res: T) => Promise<void> | void,
    errorCallback?: (error: any) => Promise<void> | void,
  ): Promise<null | T> => {
    try {
      const result: T = await requestFn();
      await successCallback?.(result);
      return result;
    } catch (error: any) {
      await errorCallback?.(error);
      return null;
    }
  };

  return { handleRequest };
}
