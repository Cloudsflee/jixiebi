#include "include.h"

#define BUS_SERVO_FRAME_HEADER      0x55
#define BUS_SERVO_FRAME_MAX_SIZE    16

static void BusServoSetTxMode(void)
{
    UART_TX_ENABLE();
}

static void BusServoSetRxMode(void)
{
    UART_RX_ENABLE();
}

static void BusServoClearRxBuffer(void)
{
    while (USART_GetFlagStatus(USART2, USART_FLAG_RXNE) != RESET)
    {
        (void)USART_ReceiveData(USART2);
    }
}

static uint8 BusServoChecksum(const uint8 *frame)
{
    uint16 sum = 0;
    uint8 i;

    for (i = 2; i < (uint8)(frame[3] + 2U); i++)
    {
        sum += frame[i];
    }

    return (uint8)(~sum);
}

static uint8 BusServoBuildFrame(uint8 id, uint8 cmd, const uint8 *args, uint8 args_len, uint8 *frame, uint8 *frame_len)
{
    uint8 i;

    if (args_len > 8U)
    {
        return 0;
    }

    frame[0] = BUS_SERVO_FRAME_HEADER;
    frame[1] = BUS_SERVO_FRAME_HEADER;
    frame[2] = id;
    frame[3] = (uint8)(args_len + 3U);
    frame[4] = cmd;

    for (i = 0; i < args_len; i++)
    {
        frame[5U + i] = args[i];
    }

    frame[5U + args_len] = BusServoChecksum(frame);
    *frame_len = (uint8)(args_len + 6U);

    return 1;
}

static void BusServoSendRaw(const uint8 *frame, uint8 len)
{
    uint8 i;

    BusServoSetTxMode();

    for (i = 0; i < len; i++)
    {
        while (USART_GetFlagStatus(USART2, USART_FLAG_TXE) == RESET)
        {
        }
        USART_SendData(USART2, frame[i]);
    }

    while (USART_GetFlagStatus(USART2, USART_FLAG_TC) == RESET)
    {
    }
}

static uint8 BusServoRecvByte(uint8 *out, uint32 timeout_ms)
{
    uint32 start = gSystemTickCount;

    while (USART_GetFlagStatus(USART2, USART_FLAG_RXNE) == RESET)
    {
        if ((gSystemTickCount - start) >= timeout_ms)
        {
            return 0;
        }
    }

    *out = (uint8)USART_ReceiveData(USART2);
    return 1;
}

static uint8 BusServoReadFrame(uint8 *frame, uint8 *frame_len, uint32 timeout_ms)
{
    uint8 byte;
    uint8 payload_len;
    uint8 i;

    if (!BusServoRecvByte(&byte, timeout_ms))
    {
        return 0;
    }

    while (byte != BUS_SERVO_FRAME_HEADER)
    {
        if (!BusServoRecvByte(&byte, timeout_ms))
        {
            return 0;
        }
    }

    if (!BusServoRecvByte(&byte, timeout_ms) || byte != BUS_SERVO_FRAME_HEADER)
    {
        return 0;
    }

    frame[0] = BUS_SERVO_FRAME_HEADER;
    frame[1] = BUS_SERVO_FRAME_HEADER;

    if (!BusServoRecvByte(&frame[2], timeout_ms))
    {
        return 0;
    }

    if (!BusServoRecvByte(&frame[3], timeout_ms))
    {
        return 0;
    }

    payload_len = frame[3];
    if ((payload_len < 3U) || (payload_len > 10U))
    {
        return 0;
    }

    for (i = 0; i < (uint8)(payload_len - 1U); i++)
    {
        if (!BusServoRecvByte(&frame[4U + i], timeout_ms))
        {
            return 0;
        }
    }

    if (BusServoChecksum(frame) != frame[(uint8)(payload_len + 2U)])
    {
        return 0;
    }

    *frame_len = (uint8)(payload_len + 3U);
    return 1;
}

static uint8 BusServoTransaction(const uint8 *tx, uint8 tx_len, uint8 need_reply, uint8 expect_id, uint8 expect_cmd, uint8 *rx, uint8 *rx_len)
{
    BusServoClearRxBuffer();
    BusServoSendRaw(tx, tx_len);

    if (!need_reply)
    {
        return 1;
    }

    BusServoSetRxMode();

    if (!BusServoReadFrame(rx, rx_len, BUS_SERVO_TIMEOUT_MS))
    {
        BusServoSetTxMode();
        return 0;
    }

    BusServoSetTxMode();

    if ((expect_id != BROADCAST_ID) && (rx[2] != expect_id))
    {
        return 0;
    }

    if (rx[4] != expect_cmd)
    {
        return 0;
    }

    return 1;
}

void InitUart2(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;
    USART_InitTypeDef USART_InitStructure;

    RCC_APB1PeriphClockCmd(RCC_APB1Periph_USART2, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_AFIO, ENABLE);

    /* USART2_TX -> PA2 */
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_2;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    /* USART2_RX -> PA3 */
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_3;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    USART_InitStructure.USART_BaudRate = 115200;
    USART_InitStructure.USART_WordLength = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits = USART_StopBits_1;
    USART_InitStructure.USART_Parity = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;

    USART_Init(USART2, &USART_InitStructure);
    USART_ITConfig(USART2, USART_IT_RXNE, DISABLE);
    USART_Cmd(USART2, ENABLE);
}

void InitBusServoCtrl(void)
{
    GPIO_InitTypeDef GPIO_InitStructure;

    InitUart2();

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_0 | GPIO_Pin_1;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    BusServoSetTxMode();
}

void USART2_IRQHandler(void)
{
    if (USART_GetITStatus(USART2, USART_IT_RXNE) != RESET)
    {
        (void)USART_ReceiveData(USART2);
    }
}

uint8 BusServoMove(uint8 id, uint16 position, uint16 time_ms)
{
    uint8 args[4];
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;

    args[0] = (uint8)(position & 0xFFU);
    args[1] = (uint8)((position >> 8) & 0xFFU);
    args[2] = (uint8)(time_ms & 0xFFU);
    args[3] = (uint8)((time_ms >> 8) & 0xFFU);

    if (!BusServoBuildFrame(id, SERVO_MOVE_TIME_WRITE, args, 4U, tx, &tx_len))
    {
        return 0;
    }

    return BusServoTransaction(tx, tx_len, 0U, id, SERVO_MOVE_TIME_WRITE, 0, 0);
}

uint8 BusServoSetID(uint8 old_id, uint8 new_id)
{
    uint8 args[1];
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;

    args[0] = new_id;

    if (!BusServoBuildFrame(old_id, SERVO_ID_WRITE, args, 1U, tx, &tx_len))
    {
        return 0;
    }

    return BusServoTransaction(tx, tx_len, 0U, old_id, SERVO_ID_WRITE, 0, 0);
}

uint8 BusServoReadID(uint8 id, uint8 *out_id)
{
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 rx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;
    uint8 rx_len = 0;

    if (out_id == 0)
    {
        return 0;
    }

    if (!BusServoBuildFrame(id, SERVO_ID_READ, 0, 0U, tx, &tx_len))
    {
        return 0;
    }

    if (!BusServoTransaction(tx, tx_len, 1U, id, SERVO_ID_READ, rx, &rx_len))
    {
        return 0;
    }

    if (rx_len < 7U)
    {
        return 0;
    }

    *out_id = rx[5];
    return 1;
}

uint8 BusServoReadPosition(uint8 id, int16 *out_position)
{
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 rx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;
    uint8 rx_len = 0;

    if (out_position == 0)
    {
        return 0;
    }

    if (!BusServoBuildFrame(id, SERVO_POS_READ, 0, 0U, tx, &tx_len))
    {
        return 0;
    }

    if (!BusServoTransaction(tx, tx_len, 1U, id, SERVO_POS_READ, rx, &rx_len))
    {
        return 0;
    }

    if (rx_len < 8U)
    {
        return 0;
    }

    *out_position = (int16)(((uint16)rx[6] << 8) | rx[5]);
    return 1;
}

uint8 BusServoReadTemp(uint8 id, uint8 *out_temp)
{
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 rx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;
    uint8 rx_len = 0;

    if (out_temp == 0)
    {
        return 0;
    }

    if (!BusServoBuildFrame(id, SERVO_TEMP_READ, 0, 0U, tx, &tx_len))
    {
        return 0;
    }

    if (!BusServoTransaction(tx, tx_len, 1U, id, SERVO_TEMP_READ, rx, &rx_len))
    {
        return 0;
    }

    if (rx_len < 7U)
    {
        return 0;
    }

    *out_temp = rx[5];
    return 1;
}

uint8 BusServoReadVin(uint8 id, uint16 *out_vin)
{
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 rx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;
    uint8 rx_len = 0;

    if (out_vin == 0)
    {
        return 0;
    }

    if (!BusServoBuildFrame(id, SERVO_VIN_READ, 0, 0U, tx, &tx_len))
    {
        return 0;
    }

    if (!BusServoTransaction(tx, tx_len, 1U, id, SERVO_VIN_READ, rx, &rx_len))
    {
        return 0;
    }

    if (rx_len < 8U)
    {
        return 0;
    }

    *out_vin = (uint16)(((uint16)rx[6] << 8) | rx[5]);
    return 1;
}

uint8 BusServoLoadOrUnload(uint8 id, uint8 load)
{
    uint8 args[1];
    uint8 tx[BUS_SERVO_FRAME_MAX_SIZE];
    uint8 tx_len = 0;

    args[0] = load ? 1U : 0U;

    if (!BusServoBuildFrame(id, SERVO_LOAD_OR_UNLOAD_WRITE, args, 1U, tx, &tx_len))
    {
        return 0;
    }

    return BusServoTransaction(tx, tx_len, 0U, id, SERVO_LOAD_OR_UNLOAD_WRITE, 0, 0);
}

void BusServoCtrl(uint8 id, uint8 cmd, uint16 prm1, uint16 prm2)
{
    if (cmd == SERVO_MOVE_TIME_WRITE)
    {
        (void)BusServoMove(id, prm1, prm2);
    }
}
