import { Container } from "./container";

export class Application {

  constructor(
    readonly container: Container
  ) {}

  start() {

    console.log(
      "AI Chat Platform Started"
    );

    return this.container;
  }
}