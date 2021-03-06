import { ButtonGroup, Button, Box, Icon, PasswordInput, TextInput, Modal } from '@rocket.chat/fuselage';
import { SHA256 } from 'meteor/sha';
import React, { useMemo, useState, useCallback } from 'react';

import Page from '../components/basic/Page';
import AccountProfileForm from './AccountProfileForm';
import ConfirmOwnerChangeWarningModal from '../components/ConfirmOwnerChangeWarningModal';
import { useTranslation } from '../contexts/TranslationContext';
import { useForm } from '../hooks/useForm';
import { useSetting } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import { useToastMessageDispatch } from '../contexts/ToastMessagesContext';
import { useMethod } from '../contexts/ServerContext';
import { useSetModal } from '../contexts/ModalContext';
import { useUpdateAvatar } from '../hooks/useUpdateAvatar';
import { getUserEmailAddress } from '../helpers/getUserEmailAddress';

const ActionConfirmModal = ({ onSave, onCancel, title, text, isPassword, ...props }) => {
	const t = useTranslation();
	const [inputText, setInputText] = useState('');

	const handleChange = useCallback((e) => setInputText(e.currentTarget.value), [setInputText]);
	const handleSave = useCallback(() => { onSave(inputText); onCancel(); }, [inputText, onSave, onCancel]);

	return <Modal {...props}>
		<Modal.Header>
			<Icon color='danger' name='modal-warning' size={20}/>
			<Modal.Title>{title}</Modal.Title>
			<Modal.Close onClick={onCancel}/>
		</Modal.Header>
		<Modal.Content fontScale='p1'>
			<Box mb='x8'>{text}</Box>
			{isPassword && <PasswordInput w='full' value={inputText} onChange={handleChange}/>}
			{!isPassword && <TextInput w='full' value={inputText} onChange={handleChange}/>}
		</Modal.Content>
		<Modal.Footer>
			<ButtonGroup align='end'>
				<Button ghost onClick={onCancel}>{t('Cancel')}</Button>
				<Button primary danger onClick={handleSave}>{t('Continue')}</Button>
			</ButtonGroup>
		</Modal.Footer>
	</Modal>;
};

const getInitialValues = (user) => ({
	realname: user.name ?? '',
	email: getUserEmailAddress(user) ?? '',
	username: user.username ?? '',
	password: '',
	confirmationPassword: '',
	avatar: '',
	url: user.avatarUrl ?? '',
	statusText: user.statusText ?? '',
	statusType: user.status ?? '',
	bio: user.bio ?? '',
	customFields: user.customFields ?? {},
});

const AccountProfilePage = () => {
	const t = useTranslation();
	const dispatchToastMessage = useToastMessageDispatch();

	const user = useUser();

	const { values, handlers, hasUnsavedChanges } = useForm(getInitialValues(user));
	const [canSave, setCanSave] = useState(true);
	const setModal = useSetModal();
	const [loggingOut, setLoggingOut] = useState(false);

	const logoutOtherClients = useMethod('logoutOtherClients');
	const deleteOwnAccount = useMethod('deleteUserOwnAccount');
	const saveFn = useMethod('saveUserProfile');

	const closeModal = useCallback(() => setModal(null), [setModal]);

	const localPassword = Boolean(user?.services?.password?.bcrypt?.trim());
	const requirePasswordConfirmation = (values.email !== getUserEmailAddress(user) || !!values.password) && localPassword;

	const erasureType = useSetting('Message_ErasureType');
	const allowRealNameChange = useSetting('Accounts_AllowRealNameChange');
	const allowUserStatusMessageChange = useSetting('Accounts_AllowUserStatusMessageChange');
	const allowUsernameChange = useSetting('Accounts_AllowUsernameChange');
	const allowEmailChange = useSetting('Accounts_AllowEmailChange');
	const allowPasswordChange = useSetting('Accounts_AllowPasswordChange');
	const allowUserAvatarChange = useSetting('Accounts_AllowUserAvatarChange');
	const allowDeleteOwnAccount = useSetting('Accounts_AllowDeleteOwnAccount');
	const ldapEnabled = useSetting('LDAP_Enable');
	const requireName = useSetting('Accounts_RequireNameForSignUp');
	const namesRegexSetting = useSetting('UTF8_Names_Validation');

	const namesRegex = useMemo(() => new RegExp(`^${ namesRegexSetting }$`), [namesRegexSetting]);

	const canChangeUsername = allowUsernameChange && !ldapEnabled;

	const settings = useMemo(() => ({
		allowRealNameChange,
		allowUserStatusMessageChange,
		allowEmailChange,
		allowPasswordChange,
		allowUserAvatarChange,
		allowDeleteOwnAccount,
		canChangeUsername,
		requireName,
		namesRegex,
	}), [
		allowDeleteOwnAccount,
		allowEmailChange,
		allowPasswordChange,
		allowRealNameChange,
		allowUserAvatarChange,
		allowUserStatusMessageChange,
		canChangeUsername,
		requireName,
		namesRegex,
	]);

	const {
		realname,
		email,
		avatar,
		username,
		password,
		statusText,
		statusType,
		customFields,
		bio,
	} = values;

	const { handleAvatar } = handlers;

	const updateAvatar = useUpdateAvatar(avatar, user._id);

	const onSave = useCallback(async () => {
		const save = async (typedPassword) => {
			try {
				const avatarResult = await updateAvatar();
				if (avatarResult) { handleAvatar(''); }
				await saveFn({
					...allowRealNameChange && { realname },
					...allowEmailChange && getUserEmailAddress(user) !== email && { email },
					...allowPasswordChange && { password },
					...canChangeUsername && { username },
					...allowUserStatusMessageChange && { statusText },
					...typedPassword && { typedPassword: SHA256(typedPassword) },
					statusType,
					bio: bio || '',
				}, customFields);
				dispatchToastMessage({ type: 'success', message: t('Profile_saved_successfully') });
			} catch (error) {
				dispatchToastMessage({ type: 'error', message: error });
			}
		};

		if (requirePasswordConfirmation) {
			return setModal(() => <ActionConfirmModal
				onSave={save}
				onCancel={closeModal}
				title={t('Please_enter_your_password')}
				text={t('For_your_security_you_must_enter_your_current_password_to_continue')}
				isPassword
			/>);
		}

		save();
	}, [
		saveFn,
		allowEmailChange,
		allowPasswordChange,
		allowRealNameChange,
		allowUserStatusMessageChange,
		bio,
		canChangeUsername,
		email,
		password,
		realname,
		statusText,
		username,
		user,
		updateAvatar,
		handleAvatar,
		closeModal,
		requirePasswordConfirmation,
		dispatchToastMessage,
		t,
		customFields,
		statusType,
		setModal,
	]);

	const handleLogoutOtherLocations = useCallback(async () => {
		setLoggingOut(true);
		try {
			await logoutOtherClients();
			dispatchToastMessage({ type: 'success', message: t('Logged_out_of_other_clients_successfully') });
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
		setLoggingOut(false);
	}, [logoutOtherClients, dispatchToastMessage, t]);

	const handleDeleteOwnAccount = useCallback(async () => {
		const save = async (passwordOrUsername) => {
			try {
				await deleteOwnAccount(SHA256(passwordOrUsername));
				dispatchToastMessage({ type: 'success', message: t('User_has_been_deleted') });
			} catch (error) {
				if (error.error === 'user-last-owner') {
					const { shouldChangeOwner, shouldBeRemoved } = error.details;
					return setModal(() => <ConfirmOwnerChangeWarningModal
						onConfirm={() => { deleteOwnAccount(SHA256(passwordOrUsername), true); }}
						onCancel={closeModal}
						contentTitle={t(`Delete_User_Warning_${ erasureType }`)}
						confirmLabel={t('Continue')}
						shouldChangeOwner={shouldChangeOwner}
						shouldBeRemoved={shouldBeRemoved}
					/>);
				}

				dispatchToastMessage({ type: 'error', message: error });
			}
		};

		const title = t('Are_you_sure_you_want_to_delete_your_account');
		if (localPassword) {
			return setModal(() => <ActionConfirmModal
				onSave={save}
				onCancel={closeModal}
				title={title}
				text={t('For_your_security_you_must_enter_your_current_password_to_continue')}
				isPassword
			/>);
		}
		return setModal(() => <ActionConfirmModal
			onSave={save}
			onCancel={closeModal}
			title={title}
			text={t('If_you_are_sure_type_in_your_username')}
			isPassword
		/>);
	}, [closeModal, deleteOwnAccount, dispatchToastMessage, erasureType, localPassword, t, setModal]);

	return <Page>
		<Page.Header title={t('Profile')}>
			<ButtonGroup>
				<Button primary disabled={!hasUnsavedChanges || !canSave || loggingOut} onClick={onSave}>
					{t('Save_changes')}
				</Button>
			</ButtonGroup>
		</Page.Header>
		<Page.ScrollableContentWithShadow>
			<Box maxWidth='600px' w='full' alignSelf='center'>
				<AccountProfileForm values={values} handlers={handlers} user={user} settings={settings} onSaveStateChange={setCanSave}/>
				<ButtonGroup stretch mb='x12'>
					<Button onClick={handleLogoutOtherLocations} flexGrow={0} disabled={loggingOut}>
						{t('Logout_Others')}
					</Button>
					{allowDeleteOwnAccount && <Button danger onClick={handleDeleteOwnAccount}>
						<Icon name='trash' size='x20' mie='x4'/>
						{t('Delete_my_account')}
					</Button>}
				</ButtonGroup>
			</Box>
		</Page.ScrollableContentWithShadow>
	</Page>;
};

export default AccountProfilePage;
