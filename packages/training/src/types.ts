export interface TrainRequest {
  businessId: string;
  filepath: string;
}

export interface TrainResult {
  success: boolean;
  chunks: number;
}