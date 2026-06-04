export type PricebookItemType = "Service" | "Product" | "Fee";

export interface PricebookCategory {
  id: string;
  name: string;
  description: string;
  imageName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricebookItem {
  id: string;
  name: string;
  modelNumber?: string;
  price: number;
  cost: number;
  categoryId: string;
  itemType: PricebookItemType;
  description: string;
  imageName?: string;
  addToOnlineBooking: boolean;
  taxable: boolean;
  createdAt: string;
  updatedAt: string;
}
