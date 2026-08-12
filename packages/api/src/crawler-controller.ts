import { CrawlerService } from "@ai-chat-platform/web-crawler";

export class CrawlerController {
  constructor(
    private readonly crawler: CrawlerService
  ) {}

  list(businessId?: string) {
    return this.crawler.listTargets(businessId);
  }

  /** Queues the target; the caller (a route handler) is responsible for
   * running `runCrawl` in the background and responding immediately. */
  queue(businessId: string, url: string) {
    new URL(url); // throws on malformed input
    return this.crawler.addTarget(businessId, url);
  }

  requeue(id: string) {
    return this.crawler.queueForCrawl(id);
  }

  /** The actual crawl — only call this from a background task. */
  runCrawl(id: string) {
    return this.crawler.runCrawl(id);
  }

  recrawlAll() {
    return this.crawler.crawlAll();
  }

  /** Manual "resync the Product table now" — normally this runs
   * automatically at the end of every runCrawl(), this exists for
   * re-deriving Product rows from what's already indexed without
   * waiting on a full recrawl (e.g. right after this feature shipped). */
  syncProducts(businessId: string) {
    return this.crawler.syncProductsNow(businessId);
  }
}
