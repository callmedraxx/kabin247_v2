import { OrderService } from './order.service';
import { Logger } from '../utils/logger';
import { getOrderRepository } from '../repositories';
import { Order } from '../models/order';

/**
 * Service to automatically update order statuses based on delivery time
 * - Sets status to "in_preparation" 4 hours before delivery time
 * - Sets status to "ready_for_delivery" 1 hour before delivery time
 */
export class OrderSchedulerService {
  private orderService: OrderService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
  private readonly IN_PREPARATION_HOURS = 4; // 4 hours before delivery
  private readonly READY_FOR_DELIVERY_HOURS = 1; // 1 hour before delivery

  constructor(orderService: OrderService) {
    this.orderService = orderService;
  }

  /**
   * Start the scheduler to check and update orders periodically
   */
  start(): void {
    if (this.intervalId) {
      Logger.warn('Order scheduler is already running');
      return;
    }

    Logger.info('Starting order status scheduler', {
      checkIntervalMinutes: this.CHECK_INTERVAL_MS / 60000,
      inPreparationHours: this.IN_PREPARATION_HOURS,
      readyForDeliveryHours: this.READY_FOR_DELIVERY_HOURS,
    });

    // Run immediately on start
    this.checkAndUpdateOrders().catch((error) => {
      Logger.error('Error in initial order status check', error);
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndUpdateOrders().catch((error) => {
        Logger.error('Error in periodic order status check', error);
      });
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      Logger.info('Order status scheduler stopped');
    }
  }

  /**
   * Check orders and update their statuses based on delivery time
   */
  private async checkAndUpdateOrders(): Promise<void> {
    try {
      const repository = getOrderRepository();
      
      // Find orders that are eligible for status updates
      // Only check orders that are in caterer_confirmed or in_preparation status
      const eligibleStatuses = ['caterer_confirmed', 'in_preparation'];
      
      // Get orders for each status separately (since findAll only accepts single status)
      const allOrders: Order[] = [];
      
      for (const status of eligibleStatuses) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Query orders with this status and delivery date today or tomorrow
        const result = await repository.findAll({
          status: status,
          start_date: now.toISOString().split('T')[0],
          end_date: tomorrow.toISOString().split('T')[0],
          limit: 500, // Reasonable limit per status
        });
        
        allOrders.push(...result.orders);
      }

      let updatedCount = 0;
      let inPreparationCount = 0;
      let readyForDeliveryCount = 0;

      for (const order of allOrders) {
        try {
          const updateResult = await this.checkAndUpdateOrderStatus(order);
          if (updateResult) {
            updatedCount++;
            if (updateResult.newStatus === 'in_preparation') {
              inPreparationCount++;
            } else if (updateResult.newStatus === 'ready_for_delivery') {
              readyForDeliveryCount++;
            }
          }
        } catch (error) {
          Logger.error(`Failed to check order ${order.id}`, error, {
            orderId: order.id,
            orderNumber: order.order_number,
          });
        }
      }

      if (updatedCount > 0) {
        Logger.info('Order status updates completed', {
          totalChecked: allOrders.length,
          updated: updatedCount,
          inPreparation: inPreparationCount,
          readyForDelivery: readyForDeliveryCount,
        });
      }
    } catch (error) {
      Logger.error('Failed to check and update orders', error);
    }
  }

  /**
   * Check a single order and update its status if needed
   */
  private async checkAndUpdateOrderStatus(
    order: Order
  ): Promise<{ updated: boolean; newStatus?: string } | null> {
    if (!order.delivery_date || !order.delivery_time) {
      return null;
    }

      // Parse delivery date and time
      // Get timezone from caterer details if available
      const timezone = order.caterer_details?.time_zone || undefined;
      
      const deliveryDateTime = this.parseDeliveryDateTime(
        order.delivery_date,
        order.delivery_time,
        timezone
      );

    if (!deliveryDateTime) {
      return null;
    }

    const now = new Date();
    const hoursUntilDelivery = (deliveryDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Determine what status the order should be in
    let targetStatus: string | null = null;

    if (hoursUntilDelivery <= this.READY_FOR_DELIVERY_HOURS && hoursUntilDelivery > 0) {
      // Between 1 hour and 0 hours before delivery -> ready_for_delivery
      if (order.status !== 'ready_for_delivery') {
        targetStatus = 'ready_for_delivery';
      }
    } else if (
      hoursUntilDelivery <= this.IN_PREPARATION_HOURS &&
      hoursUntilDelivery > this.READY_FOR_DELIVERY_HOURS
    ) {
      // Between 4 hours and 1 hour before delivery -> in_preparation
      if (order.status !== 'in_preparation' && order.status !== 'ready_for_delivery') {
        targetStatus = 'in_preparation';
      }
    }

    // Update status if needed
    if (targetStatus && order.id) {
      try {
        const updatedOrder = await this.orderService.updateOrderStatus(order.id, {
          status: targetStatus as any,
        });

        if (updatedOrder) {
          Logger.info('Order status auto-updated', {
            orderId: order.id,
            orderNumber: order.order_number,
            oldStatus: order.status,
            newStatus: targetStatus,
            hoursUntilDelivery: hoursUntilDelivery.toFixed(2),
          });

          return { updated: true, newStatus: targetStatus };
        }
      } catch (error) {
        Logger.error(`Failed to update order ${order.id} status`, error, {
          orderId: order.id,
          orderNumber: order.order_number,
          targetStatus,
        });
      }
    }

    return null;
  }

  /**
   * Parse delivery date and time, considering timezone
   */
  private parseDeliveryDateTime(
    deliveryDate: string | Date,
    deliveryTime: string,
    timezone?: string
  ): Date | null {
    try {
      // Parse delivery date
      const date = typeof deliveryDate === 'string' ? new Date(deliveryDate) : deliveryDate;
      if (isNaN(date.getTime())) {
        return null;
      }

      // Parse delivery time (format: "HH:MM" or "HH:MML")
      const timeStr = deliveryTime.replace(/L$/, ''); // Remove trailing 'L' if present
      const [hours, minutes] = timeStr.split(':').map(Number);

      if (isNaN(hours) || isNaN(minutes)) {
        return null;
      }

      // Create delivery datetime in the local timezone (or specified timezone)
      const deliveryDateTime = new Date(date);
      deliveryDateTime.setHours(hours, minutes, 0, 0);

      // If timezone is provided, convert to UTC
      // For now, we'll work with local timezone and assume delivery_time is in airport local time
      // In a production system, you'd want to properly handle timezone conversion
      if (timezone) {
        // Simple timezone offset handling
        // In production, use a proper timezone library like date-fns-tz or luxon
        // For now, we'll assume the timezone string is like "America/New_York" or "UTC-5"
        // This is a simplified implementation
        try {
          // Try to use Intl API for timezone conversion
          const utcDate = new Date(deliveryDateTime.toLocaleString('en-US', { timeZone: timezone }));
          const localDate = new Date(deliveryDateTime.toLocaleString('en-US'));
          const offset = utcDate.getTime() - localDate.getTime();
          deliveryDateTime.setTime(deliveryDateTime.getTime() - offset);
        } catch (e) {
          // If timezone conversion fails, use the date as-is
          Logger.warn('Failed to convert timezone', { timezone, error: e });
        }
      }

      return deliveryDateTime;
    } catch (error) {
      Logger.error('Failed to parse delivery date/time', error, {
        deliveryDate,
        deliveryTime,
        timezone,
      });
      return null;
    }
  }
}

// Singleton instance
let schedulerInstance: OrderSchedulerService | null = null;

/**
 * Get or create the order scheduler service instance
 */
export function getOrderScheduler(orderService: OrderService): OrderSchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new OrderSchedulerService(orderService);
  }
  return schedulerInstance;
}

