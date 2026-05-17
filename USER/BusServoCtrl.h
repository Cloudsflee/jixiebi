#ifndef _BUS_SERVO_CTRL_H_
#define _BUS_SERVO_CTRL_H_

/* Half-duplex direction control (board-specific truth table) */
#define UART_RX_ENABLE()        PAout(0) = 1; PAout(1) = 0
#define UART_TX_ENABLE()        PAout(0) = 0; PAout(1) = 1

#define BROADCAST_ID                    0xFE

#define SERVO_MOVE_TIME_WRITE           1
#define SERVO_MOVE_TIME_READ            2
#define SERVO_MOVE_STOP                 12
#define SERVO_ID_WRITE                  13
#define SERVO_ID_READ                   14
#define SERVO_TEMP_READ                 26
#define SERVO_VIN_READ                  27
#define SERVO_POS_READ                  28
#define SERVO_LOAD_OR_UNLOAD_WRITE      31
#define SERVO_LOAD_OR_UNLOAD_READ       32

#define BUS_SERVO_TIMEOUT_MS            30

void InitBusServoCtrl(void);

/* Keep compatibility with existing project calls */
void BusServoCtrl(uint8 id, uint8 cmd, uint16 prm1, uint16 prm2);

/* New helper APIs for debug/integration */
uint8 BusServoMove(uint8 id, uint16 position, uint16 time_ms);
uint8 BusServoSetID(uint8 old_id, uint8 new_id);
uint8 BusServoReadID(uint8 id, uint8 *out_id);
uint8 BusServoReadPosition(uint8 id, int16 *out_position);
uint8 BusServoReadTemp(uint8 id, uint8 *out_temp);
uint8 BusServoReadVin(uint8 id, uint16 *out_vin);
uint8 BusServoLoadOrUnload(uint8 id, uint8 load);

#endif
