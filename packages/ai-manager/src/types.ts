export interface AIProvider {
  name: string;

  health(): Promise<boolean>;

  chat(message: string): Promise<string>;
}