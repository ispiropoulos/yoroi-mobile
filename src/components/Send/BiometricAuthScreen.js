// @flow

import React from 'react'
import {compose} from 'redux'
import {withHandlers, withStateHandlers} from 'recompose'

import {Logger} from '../../utils/logging'
import {Button} from '../UiKit'
import FingerprintScreenBase from '../Common/FingerprintScreenBase'
import KeyStore from '../../crypto/KeyStore'
import {
  onDidMount,
  onWillUnmount,
  withTranslations,
} from '../../utils/renderUtils'

import styles from './styles/BiometricAuthScreen.style'

import type {ComponentType} from 'react'
import type {Navigation} from '../../types/navigation'

const getTranslations = (state) => state.trans.BiometricsAuthScreen

const handleOnConfirm = async (
  navigation,
  setError,
  clearError,
  useFallback = false,
  translations,
) => {
  const keyId = navigation.getParam('keyId')
  const onSuccess = navigation.getParam('onSuccess')
  const onFail = navigation.getParam('onFail')

  try {
    const decryptedData = await KeyStore.getData(
      keyId,
      useFallback ? 'SYSTEM_PIN' : 'BIOMETRICS',
      translations.authorizeOperation,
      '',
    )
    onSuccess(decryptedData)
    return
  } catch (error) {
    if (error.code === KeyStore.REJECTIONS.SWAPPED_TO_FALLBACK) {
      clearError()
      return
    }

    if (error.code === KeyStore.REJECTIONS.CANCELED) {
      clearError()
      onFail(KeyStore.REJECTIONS.CANCELED)
      return
    }

    if (
      error.code !== KeyStore.REJECTIONS.DECRYPTION_FAILED &&
      error.code !== KeyStore.REJECTIONS.SENSOR_LOCKOUT &&
      error.code !== KeyStore.REJECTIONS.INVALID_KEY
    ) {
      handleOnConfirm(navigation, setError, clearError, false, translations)
    } else if (error.code === KeyStore.REJECTIONS.INVALID_KEY) {
      onFail(KeyStore.REJECTIONS.INVALID_KEY)
      return
    } else {
      Logger.error('BiometricAuthScreen', error)
      setError('UNKNOWN_ERROR')
    }
    return
  }
}

const BiometricAuthScreen = ({
  cancelScanning,
  useFallback,
  error,
  translations,
}) => (
  <FingerprintScreenBase
    onGoBack={cancelScanning}
    headings={translations.headings}
    buttons={[
      <Button
        key={'use-fallback'}
        outline
        title={translations.useFallbackButton}
        onPress={useFallback}
        containerStyle={styles.useFallback}
      />,
    ]}
    error={error && translations.errors[error]}
  />
)

type ExternalProps = {|
  navigation: Navigation,
|}

type ErrorCode =
  | 'NOT_RECOGNIZED'
  | 'SENSOR_LOCKOUT'
  | 'DECRYPTION_FAILED'
  | 'UNKNOWN_ERROR'

type State = {
  error: null | ErrorCode,
}

export default (compose(
  withTranslations(getTranslations),
  withStateHandlers<State, *, *>(
    {
      error: null,
    },
    {
      setError: (state) => (error: ErrorCode) => ({error}),
      clearError: (state) => () => ({error: null}),
    },
  ),
  withHandlers({
    cancelScanning: ({setError, clearError, navigation}) => async () => {
      const wasAlreadyCanceled = !(await KeyStore.cancelFingerprintScanning(
        KeyStore.REJECTIONS.CANCELED,
      ))

      if (wasAlreadyCanceled) {
        clearError()
        navigation.getParam('onFail')(KeyStore.REJECTIONS.CANCELED)
      }
    },
    useFallback: ({
      navigation,
      setError,
      clearError,
      translations,
    }) => async () => {
      await KeyStore.cancelFingerprintScanning(
        KeyStore.REJECTIONS.SWAPPED_TO_FALLBACK,
      )
      handleOnConfirm(navigation, setError, clearError, true, translations)
    },
  }),
  onWillUnmount(async () => {
    await KeyStore.cancelFingerprintScanning(KeyStore.REJECTIONS.CANCELED)
  }),
  onDidMount(({navigation, setError, clearError, translations}) =>
    handleOnConfirm(navigation, setError, clearError, false, translations),
  ),
)(BiometricAuthScreen): ComponentType<ExternalProps>)
